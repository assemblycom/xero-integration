import 'server-only'

import SyncedContactsService from '@invoice-sync/lib/SyncedContacts.service'
import SyncedPaymentsService from '@invoice-sync/lib/SyncedPayments.service'
import SyncedTaxRatesService from '@invoice-sync/lib/SyncedTaxRates.service'
import { serializeLineItems } from '@invoice-sync/lib/serializers'
import type { InvoiceCreatedEvent } from '@invoice-sync/types'
import SyncedItemsService from '@items-sync/lib/SyncedItems.service'
import { SyncLogsService } from '@sync-logs/lib/SyncLogs.service'
import dayjs from 'dayjs'
import { and, desc, eq } from 'drizzle-orm'
import status from 'http-status'
import { Invoice, type Item } from 'xero-node'
import z from 'zod'
import env from '@/config/server.env'
import { getTableFields } from '@/db/db.helpers'
import { type SyncedInvoiceCreatePayload, syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { SyncEntityType, SyncEventType, SyncStatus } from '@/db/schema/syncLogs.schema'
import APIError from '@/errors/APIError'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import RegionService from '@/lib/xero/Region.service'
import type { RegionConfig } from '@/lib/xero/region'
import {
  CreateInvoicePayloadSchema,
  type CreateInvoicePayload as InvoiceCreatePayload,
} from '@/lib/xero/types'
import { datetimeToDate } from '@/utils/date'
import SyncedAccountsService from './SyncedAccounts.service'

class SyncedInvoicesService extends AuthenticatedXeroService {
  /**
   * @core
   * Core handler for invoice.created that syncs invoice data from Copilot to Xero
   */
  async syncInvoiceToXero(data: InvoiceCreatedEvent): Promise<{
    copilotInvoiceId: string
    xeroInvoiceId: string | null
    status: NonNullable<SyncedInvoiceCreatePayload['status']>
  }> {
    logger.info('SyncedInvoicesService#syncInvoiceToXero :: Syncing invoice to xero:', data.id)

    // Check idempotency before the setup below so replays skip the Xero API calls.
    let syncedInvoiceRecord = await this.getOrCreateInvoiceRecord(data.id)
    if (syncedInvoiceRecord.status === 'success') {
      logger.info(
        `XeroInvoiceSyncService#syncInvoiceToXero :: Ignoring ${syncedInvoiceRecord.status} sync`,
      )
      return syncedInvoiceRecord
    }

    const regionService = new RegionService(this.user, this.connection)
    const regionConfig = await regionService.getRegionConfig()
    if (!regionConfig) {
      // The webhook gate already skips unsupported regions, so null here means a bug.
      throw new APIError(
        'Cannot sync invoice: Xero region is not supported',
        status.INTERNAL_SERVER_ERROR,
      )
    }

    const taxRatePromise = this.getTaxRate(data, regionConfig)
    const contactPromise = this.getContact(data)
    const productIdToXeroItemPromise = this.getProductIdToXeroItem(data)

    // Xero rejects an invoice line whose accountCode doesn't exist in the org's chart of accounts
    const syncedAccountsService = new SyncedAccountsService(this.user, this.connection)
    const salesAccountPromise = syncedAccountsService.getOrCreateCopilotSalesAccount(regionConfig)

    const [
      taxRate,
      { contactID, emailAddress: customerEmail, name: customerName },
      productIdToXeroItem,
      salesAccount,
    ] = await Promise.all([
      taxRatePromise,
      contactPromise,
      productIdToXeroItemPromise,
      salesAccountPromise,
    ])

    const lineItems = serializeLineItems(
      data.lineItems,
      productIdToXeroItem,
      z.string().parse(salesAccount.code),
      taxRate,
    )
    if (!lineItems.length) {
      logger.info('No valid line items to sync to Xero invoice. Skipping sync...')
      return {
        copilotInvoiceId: data.id,
        xeroInvoiceId: null,
        status: 'pending',
      }
    }

    // Prepare invoice creation payload
    const invoice = CreateInvoicePayloadSchema.parse({
      type: Invoice.TypeEnum.ACCREC,
      invoiceNumber: data.number,
      contact: { contactID },
      dueDate: datetimeToDate(data.dueDate || dayjs().format('YYYY-MM-DDTHH:mm:ss.SSSZ')),
      lineItems,
      status: Invoice.StatusEnum.AUTHORISED,
      date: datetimeToDate(data.sentDate || dayjs().format('YYYY-MM-DDTHH:mm:ss.SSSZ')),
    } satisfies InvoiceCreatePayload)

    let syncedInvoice: Invoice | undefined
    // Create and save invoice status
    try {
      logger.info(
        'SyncedInvoicesService#syncInvoiceToXero :: Creating invoice in Xero with payload:',
        invoice,
      )
      syncedInvoice = await this.xero.createInvoice(this.connection.tenantId, invoice)
      syncedInvoiceRecord = await this.updateInvoiceRecord(
        data,
        syncedInvoice,
        syncedInvoice ? 'success' : 'failed',
      )

      // Add sync log
      const syncLogsService = new SyncLogsService(this.user, this.connection)
      await syncLogsService.createSyncLog({
        entityType: SyncEntityType.INVOICE,
        eventType: SyncEventType.CREATED,
        status: SyncStatus.SUCCESS,
        syncDate: new Date(),
        amount: String(data.total / 100),
        taxAmount: String(invoice.lineItems.reduce((a, i) => a + i.taxAmount, 0)),
        invoiceNumber: data.number,
        copilotId: data.id,
        xeroId: syncedInvoice?.invoiceID,
        customerEmail,
        customerName,
      })
    } catch (error: unknown) {
      console.error(JSON.stringify(error))
      syncedInvoiceRecord = await this.updateInvoiceRecord(data, undefined, 'failed')
      throw new APIError('Failed to store synced invoice record', status.INTERNAL_SERVER_ERROR, {
        error,
        failedSyncLogPayload: {
          entityType: SyncEntityType.INVOICE,
          eventType: SyncEventType.CREATED,
          amount: String(data.total / 100),
          taxAmount: String(invoice.lineItems.reduce((a, i) => a + i.taxAmount, 0)), // Doing this instead of using total taxAmount to prevent inconsistencies
          invoiceNumber: data.number,
          copilotId: data.id,
          xeroId: syncedInvoice?.invoiceID,
          customerEmail,
          customerName,
        },
      })
    }

    logger.info(
      `SyncedInvoicesService#syncInvoiceToXero :: Synced Copilot invoice ${syncedInvoiceRecord.copilotInvoiceId} (${syncedInvoice?.invoiceNumber}) to Xero invoice ${syncedInvoiceRecord.xeroInvoiceId} for portalId ${this.connection.portalId}`,
    )
    return syncedInvoiceRecord
  }

  private async createMissingXeroInvoice(copilotInvoiceId: string) {
    logger.info(
      'SyncedInvoicesService#createMissingXeroInvoice :: Creating missing Xero invoice for:',
      copilotInvoiceId,
    )
    const invoice = await this.copilot.getInvoice(copilotInvoiceId)
    const [record, contact] = await Promise.all([
      this.syncInvoiceToXero(invoice),
      this.getContact(invoice),
    ])
    if (!('xeroInvoiceId' in record) || !record.xeroInvoiceId) {
      throw new APIError(
        `Failed to create Xero invoice for Copilot invoice ${copilotInvoiceId}`,
        status.INTERNAL_SERVER_ERROR,
      )
    }

    const syncLogsService = new SyncLogsService(this.user, this.connection)
    await syncLogsService.createSyncLog({
      entityType: SyncEntityType.INVOICE,
      eventType: SyncEventType.CREATED,
      status: SyncStatus.SUCCESS,
      syncDate: new Date(),
      amount: String(invoice.total / 100),
      taxAmount: String(invoice.taxAmount),
      invoiceNumber: invoice.number,
      copilotId: invoice.id,
      xeroId: record.xeroInvoiceId,
      customerEmail: contact.emailAddress,
      customerName: contact.name,
    })

    return record
  }

  async getValidatedInvoiceRecord(copilotInvoiceId: string) {
    logger.info(
      'SyncedInvoicesService#getValidatedInvoiceRecord :: Getting invoice record for:',
      copilotInvoiceId,
    )
    let invoiceRecord = await this.getOrCreateInvoiceRecord(copilotInvoiceId)

    if (!invoiceRecord.xeroInvoiceId) {
      invoiceRecord = await this.createMissingXeroInvoice(copilotInvoiceId)
    }

    const invoice = await this.xero.getInvoiceById(
      this.connection.tenantId,
      z.uuid().parse(invoiceRecord.xeroInvoiceId),
    )
    if (!invoice) {
      throw new APIError(
        `Xero invoice ${invoiceRecord.xeroInvoiceId} not found for Copilot invoice ${copilotInvoiceId}`,
        status.NOT_FOUND,
      )
    }

    logger.info(
      'SyncedInvoicesService#getValidatedInvoiceRecord :: Fetched Xero invoice for payment sync:',
      invoice.invoiceID,
    )
    return { invoiceRecord, invoice }
  }

  /**
   * @core
   * Core handler for invoice.paid that syncs a invoice payment to Xero
   */
  async syncPaidInvoiceToXero(copilotInvoiceId: string) {
    logger.info(
      'SyncedInvoicesService#syncPaidInvoiceToXero :: Syncing paid invoice to xero:',
      copilotInvoiceId,
    )

    const { invoiceRecord, invoice } = await this.getValidatedInvoiceRecord(copilotInvoiceId)
    const xeroInvoiceId = z.uuid().parse(invoiceRecord.xeroInvoiceId)

    const paymentsService = new SyncedPaymentsService(this.user, this.connection)

    const syncLogsService = new SyncLogsService(this.user, this.connection)
    const prevSyncLog = await syncLogsService.getInvoiceCreatedSyncLog(copilotInvoiceId)

    if (invoiceRecord.status === 'success') {
      const pastPayment = await paymentsService.getPaymentForInvoiceId(copilotInvoiceId)
      if (pastPayment) {
        return logger.info(
          'SyncedInvoicesService#syncPaidInvoiceToXero :: Skipping successfully paid invoice with payment',
          pastPayment,
        )
      }
    }

    // Resolved after the idempotency check (so replays skip the work)
    const regionService = new RegionService(this.user, this.connection)
    const regionConfig = await regionService.getRegionConfig()
    if (!regionConfig) {
      // The webhook gate already skips unsupported regions, so null here means a bug.
      throw new APIError(
        'Cannot sync paid invoice: Xero region is not supported',
        status.INTERNAL_SERVER_ERROR,
      )
    }

    try {
      const syncedAccountsService = new SyncedAccountsService(this.user, this.connection)
      const salesAccount = await syncedAccountsService.getOrCreateCopilotSalesAccount(regionConfig)

      const payment = await this.xero.markInvoicePaid(
        this.connection.tenantId,
        xeroInvoiceId,
        z.coerce.number().parse(invoice.total),
        z.string().parse(salesAccount.code),
      )

      if (!payment) {
        throw new APIError('Failed to create a payment in Xero', status.INTERNAL_SERVER_ERROR)
      }

      await this.db.transaction(async (tx) => {
        await tx
          .update(syncedInvoices)
          .set({ status: 'success' })
          .where(
            and(
              eq(syncedInvoices.portalId, this.user.portalId),
              eq(syncedInvoices.tenantId, this.connection.tenantId),
              eq(syncedInvoices.copilotInvoiceId, copilotInvoiceId),
            ),
          )
        paymentsService.setTx(tx)
        await paymentsService.createPaymentRecord({
          copilotInvoiceId,
          copilotPaymentId: null,
          xeroInvoiceId,
          xeroPaymentId: z.string().parse(payment.paymentID),
        })
        paymentsService.unsetTx()

        // Create sync log
        syncLogsService.setTx(tx)
        await syncLogsService.createSyncLog({
          ...prevSyncLog,
          eventType: SyncEventType.PAID,
          status: SyncStatus.SUCCESS,
          syncDate: new Date(),
        })
        syncLogsService.unsetTx()
      })

      return payment
    } catch (error: unknown) {
      throw new APIError('Failed to sync invoice payment', status.INTERNAL_SERVER_ERROR, {
        error,
        failedSyncLogPayload: {
          ...prevSyncLog,
          entityType: SyncEntityType.INVOICE,
          eventType: SyncEventType.PAID,
          amount: String(invoice.total || 0),
          copilotId: copilotInvoiceId,
          xeroId: invoice.invoiceID,
        },
      })
    }
  }

  /**
   * @core
   * Core handler for invoice.voided that syncs the voiding of an invoice in Copilot
   * to Xero
   * @param copilotInvoiceId
   * @returns
   */
  async voidInvoice(copilotInvoiceId: string) {
    logger.info('SyncedInvoicesService#voidInvoice :: Voiding invoice in xero:', copilotInvoiceId)

    const { invoiceRecord } = await this.getValidatedInvoiceRecord(copilotInvoiceId)

    const syncLogsService = new SyncLogsService(this.user, this.connection)
    const prevSyncLog = await syncLogsService.getInvoiceCreatedSyncLog(copilotInvoiceId)

    try {
      const voidedInvoice = await this.xero.voidInvoice(
        this.connection.tenantId,
        z.uuid().parse(invoiceRecord.xeroInvoiceId),
      )

      // Add to sync log
      await syncLogsService.createSyncLog({
        ...prevSyncLog,
        eventType: SyncEventType.VOIDED,
        status: SyncStatus.SUCCESS,
        syncDate: new Date(),
      })

      return voidedInvoice
    } catch (error: unknown) {
      throw new APIError('Failed to void invoice', status.INTERNAL_SERVER_ERROR, {
        error,
        failedSyncLogPayload: {
          ...prevSyncLog,
          eventType: SyncEventType.VOIDED,
        },
      })
    }
  }

  /**
   * @core
   * Core handler for invoice.deleted that syncs the deletion of a voided invoice in Copilot
   * to Xero
   */
  async deleteInvoice(copilotInvoiceId: string) {
    logger.info(
      'SyncedInvoicesService#deleteInvoice :: Deleting invoice in xero:',
      copilotInvoiceId,
    )
    const syncLogsService = new SyncLogsService(this.user, this.connection)
    const prevSyncLog = await syncLogsService.getInvoiceCreatedSyncLog(copilotInvoiceId)

    try {
      const { invoiceRecord, invoice } = await this.getValidatedInvoiceRecord(copilotInvoiceId)
      if (invoice.status !== Invoice.StatusEnum.VOIDED) {
        await this.voidInvoice(copilotInvoiceId)
      }

      if (!env.FLAG_ENABLE_DELETE_SYNC) {
        logger.warn('SyncedInvoicesService#deleteInvoice :: Delete sync is disabled. Skipping...')
        return invoice
      }

      const deletedInvoice = await this.xero.deleteInvoice(
        this.connection.tenantId,
        z.uuid().parse(invoiceRecord.xeroInvoiceId),
      )

      // Add to sync log
      await syncLogsService.createSyncLog({
        ...prevSyncLog,
        eventType: SyncEventType.DELETED,
        status: SyncStatus.SUCCESS,
        syncDate: new Date(),
      })

      return deletedInvoice
    } catch (error: unknown) {
      throw new APIError('Failed to sync invoice deletion', status.INTERNAL_SERVER_ERROR, {
        error,
        failedSyncLogPayload: {
          ...prevSyncLog,
          eventType: SyncEventType.DELETED,
        },
      })
    }
  }

  async getLastSyncedAt(): Promise<Date | null> {
    logger.info(
      'SyncedInvoicesService#getLastSyncedAt :: Fetching last synced at for portalId:',
      this.user.portalId,
    )

    const selectFields = getTableFields(syncedInvoices, ['createdAt'])

    const [lastSyncedInvoice] = await this.db
      .select(selectFields)
      .from(syncedInvoices)
      .where(
        and(
          eq(syncedInvoices.portalId, this.user.portalId),
          eq(syncedInvoices.tenantId, this.connection.tenantId),
          eq(syncedInvoices.status, 'success'),
        ),
      )
      .orderBy(desc(syncedInvoices.createdAt))
      .limit(1)

    return lastSyncedInvoice ? lastSyncedInvoice.createdAt : null
  }

  private async getTaxRate(data: InvoiceCreatedEvent, regionConfig: RegionConfig) {
    logger.info(
      'SyncedInvoicesService#getTaxRate :: Fetching tax rate for',
      data.taxAmount,
      data.taxPercentage,
    )

    const xeroTaxService = new SyncedTaxRatesService(this.user, this.connection)
    return data.taxAmount
      ? await xeroTaxService.getTaxRateForItem(data.taxPercentage, regionConfig)
      : undefined
  }

  private async getContact(data: InvoiceCreatedEvent) {
    logger.info(
      'SyncedInvoicesService#getContact :: Fetching contact for',
      data.clientId,
      data.companyId,
    )

    const xeroContactService = new SyncedContactsService(this.user, this.connection)
    return await xeroContactService.getSyncedContact(data.clientId, data.companyId)
  }

  /**
   * Creates a mapping of productId to Xero Item for all line items in the invoice.
   * Uses the `syncProductsAutomatically` setting to determine whether to create new items in Xero or create a service invoice.
   */
  private async getProductIdToXeroItem(data: InvoiceCreatedEvent): Promise<Record<string, Item>> {
    logger.info(
      'SyncedInvoicesService#getProductIdToXeroItem :: Getting productId to xero item for line items...',
    )

    const syncedItemsService = new SyncedItemsService(this.user, this.connection)
    const [xeroItems, syncedItemsMap] = await Promise.all([
      this.xero.getItems(this.connection.tenantId),
      syncedItemsService.getSyncedItemsMapByProductIds('all'),
    ])
    // const [xeroItems, syncedItemsMap, products, prices] = await Promise.all([
    //   this.xero.getItems(this.connection.tenantId),
    //   syncedItemsService.getSyncedItemsMapByProductIds('all'),
    //   this.copilot.getProductsMapById('all'),
    //   this.copilot.getPricesMapById('all'),
    // ])

    const productIdToXeroItem: Record<string, Item> = {}

    // NOTE: IMPORTANT:
    // Uncomment commented lines if we want previously unsynced items to create new items on invoice creation

    // const itemsToCreate: Item[] = []
    // const itemCodeToPriceMap: Record<string, CopilotPrice> = {}

    for (const item of data.lineItems) {
      if (!item.productId) continue

      // Case I: For line item with productId, if synced product exists, use it
      const matchedXeroItemId = syncedItemsMap[item.productId]?.itemId
      if (matchedXeroItemId) {
        const xeroItem = xeroItems.find((i) => i.itemID === matchedXeroItemId)
        if (xeroItem) {
          productIdToXeroItem[item.productId] = xeroItem
          // continue
        }
      }
    }

    return productIdToXeroItem
  }

  async getOrCreateInvoiceRecord(
    copilotInvoiceId: string,
    syncedInvoice?: Invoice,
    status?: SyncedInvoiceCreatePayload['status'], // allow db to default to 'pending'
    ignoreCreate?: boolean,
  ) {
    logger.info(
      'SyncedInvoicesService#getOrCreateInvoiceRecord :: Getting or creating new invoice for',
      copilotInvoiceId,
      syncedInvoice,
      status,
    )

    const selectFields = getTableFields(syncedInvoices, [
      'copilotInvoiceId',
      'xeroInvoiceId',
      'status',
    ])

    const [prevInvoice] = await this.db
      .select(selectFields)
      .from(syncedInvoices)
      .where(
        and(
          eq(syncedInvoices.portalId, this.user.portalId),
          eq(syncedInvoices.tenantId, this.connection.tenantId),
          eq(syncedInvoices.copilotInvoiceId, copilotInvoiceId),
        ),
      )
    if (prevInvoice) {
      logger.info(
        'SyncedInvoicesService#getOrCreateInvoiceRecord :: Found existing invoice. Ignoring creation.',
        prevInvoice,
      )
      return prevInvoice
    }

    if (ignoreCreate) {
      logger.info(
        'SyncedInvoicesService#getOrCreateInvoiceRecord :: Ignoring creation of new invoice.',
        copilotInvoiceId,
      )
      return prevInvoice // This is intentionally `never`
    }

    const [invoice] = await this.db
      .insert(syncedInvoices)
      .values({
        portalId: this.user.portalId,
        tenantId: this.connection.tenantId,
        copilotInvoiceId,
        xeroInvoiceId: syncedInvoice?.invoiceID,
        status,
      })
      .returning(selectFields)
    return invoice
  }

  private async updateInvoiceRecord(
    data: InvoiceCreatedEvent,
    syncedInvoice?: Invoice,
    status?: SyncedInvoiceCreatePayload['status'],
  ) {
    logger.info(
      'SyncedInvoicesService#updateInvoiceRecord :: Updating invoice for',
      data.id,
      syncedInvoice?.invoiceID,
      status,
    )
    const [invoice] = await this.db
      .update(syncedInvoices)
      .set({
        xeroInvoiceId: syncedInvoice?.invoiceID,
        portalId: this.user.portalId,
        tenantId: this.connection.tenantId,
        status,
      })
      .where(
        and(
          eq(syncedInvoices.portalId, this.user.portalId),
          eq(syncedInvoices.tenantId, this.connection.tenantId),
          eq(syncedInvoices.copilotInvoiceId, data.id),
        ),
      )
      .returning({
        copilotInvoiceId: syncedInvoices.copilotInvoiceId,
        xeroInvoiceId: syncedInvoices.xeroInvoiceId,
        status: syncedInvoices.status,
      })
    return invoice
  }
}

export default SyncedInvoicesService
