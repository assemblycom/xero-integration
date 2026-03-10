import 'server-only'

import {
  serializeContactForClient,
  serializeContactForCompany,
} from '@invoice-sync/lib/serializers'
import SettingsService from '@settings/lib/Settings.service'
import { SyncLogsService } from '@sync-logs/lib/SyncLogs.service'
import { and, eq } from 'drizzle-orm'
import status from 'http-status'
import type { Contact } from 'xero-node'
import z from 'zod'
import { SyncedContactUserType, syncedContacts } from '@/db/schema/syncedContacts.schema'
import { SyncEntityType, SyncEventType, SyncStatus } from '@/db/schema/syncLogs.schema'
import APIError from '@/errors/APIError'
import type { ClientResponse, CompanyResponse } from '@/lib/copilot/types'
import { buildClientName } from '@/lib/copilot/utils'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import type { ContactCreatePayload, ValidContact } from '@/lib/xero/types'

class SyncedContactsService extends AuthenticatedXeroService {
  async getSyncedContact(clientId: string | undefined, companyId: string): Promise<Contact> {
    // NOTE: Absence of clientId means that the invoice is billed to a company
    logger.info('SyncedContactsService#getSyncedContact :: Getting synced contact for', clientId)

    const settingsService = new SettingsService(this.user, this.connection)
    const { useCompanyName } = await settingsService.getOrCreateSettings()

    const client = clientId ? await this.copilot.getClient(clientId) : undefined

    let company: CompanyResponse | undefined
    // If useCompanyName is true or clientId is undefined, then the invoice is billed to a company
    // `company` variable will be populated then.
    if (useCompanyName || !clientId) {
      company = await this.copilot.getCompany(companyId)
    }

    const query = this.db
      .select({ contactID: syncedContacts.contactId })
      .from(syncedContacts)
      .where(
        and(
          eq(syncedContacts.portalId, this.user.portalId),
          eq(syncedContacts.tenantId, this.connection.tenantId),
          eq(syncedContacts.clientOrCompanyId, useCompanyName || !clientId ? companyId : clientId),
          eq(
            syncedContacts.userType,
            useCompanyName || !clientId
              ? SyncedContactUserType.COMPANY
              : SyncedContactUserType.CLIENT,
          ),
        ),
      )

    let [contact] = await query

    // If contact exists, return it and end method. Else, delete existing contact sync to create a new one.
    if (contact) {
      const xeroContact = await this.xero.getContact(this.connection.tenantId, contact.contactID)
      if (xeroContact) {
        await this.validateXeroContact(xeroContact, useCompanyName, client, company)
        return xeroContact
      }

      await this.db
        .delete(syncedContacts)
        .where(
          and(
            eq(syncedContacts.portalId, this.user.portalId),
            eq(syncedContacts.tenantId, this.connection.tenantId),
            eq(
              syncedContacts.clientOrCompanyId,
              useCompanyName || !clientId ? companyId : clientId,
            ),
          ),
        )
    }

    logger.info(
      `SyncedContactsService#createContact :: Couldn't find existing client... creating a new one for ${clientId}`,
    )
    contact = await this.createContact(client, company)

    return contact
  }

  /**
   * Accepts either client or company and creates a contact for it
   */
  async createContact(
    client?: ClientResponse,
    company?: CompanyResponse,
  ): Promise<Contact & { contactID: string }> {
    logger.info(
      'SyncedContactsService#createContact :: Creating synced contact for client',
      client,
      'or company',
      company,
    )
    if (!client && !company) {
      throw new APIError('Client or company is required to create a contact', status.BAD_REQUEST)
    }
    const isNotPlaceholderCompany = company && !company.isPlaceholder
    const companyId = z.string().parse(company?.id || client?.companyIds?.[0])

    let contactPayload: ContactCreatePayload

    if (isNotPlaceholderCompany) {
      contactPayload = serializeContactForCompany(
        company,
        company.customFields?.email || client?.email,
      )
    } else if (client) {
      contactPayload = serializeContactForClient(client)
    } else {
      throw new APIError('Client or company is required to create a contact', status.BAD_REQUEST)
    }

    const syncLogsService = new SyncLogsService(this.user, this.connection)

    try {
      const contact = await this.xero.createContact(this.connection.tenantId, contactPayload)

      await this.db.insert(syncedContacts).values({
        portalId: this.user.portalId,
        clientOrCompanyId: isNotPlaceholderCompany ? companyId : z.string().parse(client?.id),
        userType: isNotPlaceholderCompany
          ? SyncedContactUserType.COMPANY
          : SyncedContactUserType.CLIENT,
        contactId: z.string().parse(contact.contactID),
        tenantId: this.connection.tenantId,
      })

      await syncLogsService.createSyncLog({
        entityType: SyncEntityType.CUSTOMER,
        eventType: SyncEventType.CREATED,
        status: SyncStatus.SUCCESS,
        syncDate: new Date(),
        copilotId: isNotPlaceholderCompany ? companyId : z.string().parse(client?.id),
        xeroId: contact.contactID,
        customerName: contact.name,
        customerEmail: contact.emailAddress,
      })

      return {
        ...contact,
        contactID: z.string().parse(contact.contactID),
      }
    } catch (error: unknown) {
      throw new APIError('Failed to create synced contact', status.INTERNAL_SERVER_ERROR, {
        error,
        failedSyncLogPayload: {
          entityType: SyncEntityType.CUSTOMER,
          eventType: SyncEventType.CREATED,
          copilotId: isNotPlaceholderCompany ? companyId : z.string().parse(client?.id),
          customerName: contactPayload.name,
          customerEmail: contactPayload.emailAddress,
        },
      })
    }
  }

  /**
   * Makes sure that client / company information between Xero and Copilot is synced.
   * If details are not synced, update the Xero contact.
   */
  async validateXeroContact(
    contact: ValidContact,
    useCompanyName: boolean,
    client?: ClientResponse,
    company?: CompanyResponse,
  ) {
    logger.info(
      'SyncedContactsService#validateXeroContact :: Validating xero contact for ',
      contact.name,
      `(${contact.name}, ${contact.firstName} ${contact.lastName}, ${contact.emailAddress})`,
      'using company name:',
      useCompanyName,
      'with client & company:',
      client,
      company,
    )

    if (useCompanyName && !company) {
      throw new APIError(
        'Failed to fetch company details while using use company name setting',
        status.INTERNAL_SERVER_ERROR,
      )
    }

    const syncLogsService = new SyncLogsService(this.user, this.connection)

    if ((useCompanyName || !client) && company && !company.isPlaceholder) {
      if (contact.name !== `${company.name}`) {
        try {
          const updatedContact = await this.xero.updateContact(this.connection.tenantId, {
            ...contact,
            name: `${company.name}`,
          })

          await syncLogsService.createSyncLog({
            entityType: SyncEntityType.CUSTOMER,
            eventType: SyncEventType.UPDATED,
            status: SyncStatus.SUCCESS,
            syncDate: new Date(),
            copilotId: company.id,
            xeroId: updatedContact.contactID,
            customerName: updatedContact.name,
            customerEmail: updatedContact.emailAddress,
          })
        } catch (error: unknown) {
          throw new APIError('Failed to update synced contact', status.INTERNAL_SERVER_ERROR, {
            error,
            failedSyncLogPayload: {
              entityType: SyncEntityType.CUSTOMER,
              eventType: SyncEventType.UPDATED,
              copilotId: company.id,
              customerName: company.name,
            },
          })
        }
      }
      return
    }

    if (
      client &&
      (contact.name !== buildClientName(client) ||
        contact.firstName !== client.givenName ||
        contact.lastName !== client.familyName ||
        contact.emailAddress !== client.email)
    ) {
      try {
        const updatedContact = await this.xero.updateContact(this.connection.tenantId, {
          ...contact,
          name: buildClientName(client),
          firstName: client.givenName,
          lastName: client.familyName,
          emailAddress: client.email,
        })

        await syncLogsService.createSyncLog({
          entityType: SyncEntityType.CUSTOMER,
          eventType: SyncEventType.UPDATED,
          status: SyncStatus.SUCCESS,
          syncDate: new Date(),
          copilotId: client.id,
          xeroId: updatedContact.contactID,
          customerName: updatedContact.name,
          customerEmail: updatedContact.emailAddress,
        })
      } catch (error: unknown) {
        throw new APIError('Failed to update synced contact', status.INTERNAL_SERVER_ERROR, {
          error,
          failedSyncLogPayload: {
            entityType: SyncEntityType.CUSTOMER,
            eventType: SyncEventType.UPDATED,
            copilotId: client.id,
            customerName: buildClientName(client),
            customerEmail: client.email,
          },
        })
      }
      return
    }
    logger.info('SyncedContactsService#createContact :: No changes detected')
  }
}

export default SyncedContactsService
