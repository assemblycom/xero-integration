import 'server-only'

import FailedSyncsService from '@failed-syncs/lib/FailedSyncs.service'
import XeroInvoiceSyncService from '@invoice-sync/lib/SyncedInvoices.service'
import SyncedPaymentsService from '@invoice-sync/lib/SyncedPayments.service'
import {
  InvoiceCreatedEventSchema,
  InvoiceModifiedEventSchema,
  PaymentSucceededEventSchema,
  PriceCreatedEventSchema,
  ProductUpdatedEventSchema,
  ValidWebhookEvent,
  type WebhookEvent,
} from '@invoice-sync/types'
import SyncedItemsService from '@items-sync/lib/SyncedItems.service'
import SettingsService from '@settings/lib/Settings.service'
import { SyncLogsService } from '@sync-logs/lib/SyncLogs.service'
import status from 'http-status'
import { SyncStatus } from '@/db/schema/syncLogs.schema'
import APIError from '@/errors/APIError'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import RegionService from '@/lib/xero/Region.service'
import { type ItemUpdatePayload, ItemUpdatePayloadSchema } from '@/lib/xero/types'
import { htmlToText } from '@/utils/html'
import { sleep } from '@/utils/sleep'

class WebhookService extends AuthenticatedXeroService {
  async handleEvent(data: WebhookEvent) {
    logger.info(
      'WebhookService#handleEvent :: Handling webhook for user',
      this.user.portalId,
      this.user.token,
    )
    logger.info('WebhookService#handleEvent :: Received webhook event data', data)

    // Gate sync to supported Xero regions (US, AU). getRegionConfig throws APIError with
    // status.OK for unsupported regions, which the catch below treats as "ignore this event".
    // The inner sync services resolve the region again; that re-resolve is a cheap DB read
    // once this call has persisted the country code, so we don't thread the value through.
    const regionService = new RegionService(this.user, this.connection)
    await regionService.getRegionConfig()

    const eventHandlerMap: Record<WebhookEvent['eventType'], (data: unknown) => Promise<unknown>> =
      {
        [ValidWebhookEvent.InvoiceCreated]: this.handleInvoiceCreated,
        [ValidWebhookEvent.InvoiceUpdated]: this.handleInvoiceUpdated,
        [ValidWebhookEvent.InvoicePaid]: this.handleInvoicePaid,
        [ValidWebhookEvent.InvoiceVoided]: this.handleInvoiceVoided,
        [ValidWebhookEvent.InvoiceDeleted]: this.handleInvoiceDeleted,
        [ValidWebhookEvent.ProductUpdated]: this.handleProductUpdated,
        [ValidWebhookEvent.PriceCreated]: this.handlePriceCreated,
        [ValidWebhookEvent.PaymentSucceeded]: this.handlePaymentSucceeded,
      }

    const handler = eventHandlerMap[data.eventType]
    try {
      return await handler(data.data)
    } catch (e: unknown) {
      // If its an APIError with status OK, we can just ignore it
      if (e instanceof APIError && e.status === status.OK) {
        return
      }

      if (e instanceof APIError && e.opts?.failedSyncLogPayload) {
        const syncLogsService = new SyncLogsService(this.user, this.connection)
        await syncLogsService.createSyncLog({
          ...e.opts.failedSyncLogPayload,
          status: SyncStatus.FAILED,
          syncDate: new Date(),
          errorMessage: e.message,
        })
      }

      // Add sync failure record
      const failedSyncsService = new FailedSyncsService(this.user)
      await failedSyncsService.addFailedSyncRecord(
        this.connection.tenantId,
        data.eventType,
        data.data,
      )
      throw e
    }
  }

  private handleInvoiceCreated = async (eventData: unknown) => {
    logger.info('WebhookService#handleInvoiceCreated :: Handling invoice created')

    const data = InvoiceCreatedEventSchema.parse(eventData)
    if (data.status === 'draft') {
      throw new APIError(`Ignoring draft invoice ${data.id}`, status.OK)
    }
    const xeroInvoiceSyncService = new XeroInvoiceSyncService(this.user, this.connection)
    if (data.collectionMethod === 'chargeAutomatically') {
      logger.info('Skipping invoice creation for a charge automatically invoice')
      return
    }
    return await xeroInvoiceSyncService.syncInvoiceToXero(data)
  }

  private handleInvoiceUpdated = async (eventData: unknown) => {
    await sleep(7000) // Gharelu upachar for race condition
    logger.info('WebhookService#handleInvoiceUpdated :: Handling invoice updated')

    const data = InvoiceCreatedEventSchema.parse(eventData)
    const invoiceSyncService = new XeroInvoiceSyncService(this.user, this.connection)
    const pastInvoice = await invoiceSyncService.getOrCreateInvoiceRecord(
      data.id,
      undefined,
      undefined,
      true,
    )
    if (pastInvoice) {
      return null
    }
    return await invoiceSyncService.syncInvoiceToXero(data)
  }

  private handleInvoicePaid = async (eventData: unknown) => {
    logger.info('WebhookService#handleInvoicePaid :: Handling invoice paid')

    const data = InvoiceModifiedEventSchema.parse(eventData)
    const invoiceSyncService = new XeroInvoiceSyncService(this.user, this.connection)
    return await invoiceSyncService.syncPaidInvoiceToXero(data.id)
  }

  private handleInvoiceVoided = async (eventData: unknown) => {
    logger.info('WebhookService#handleInvoiceVoided :: Handling invoice voided')

    const data = InvoiceModifiedEventSchema.parse(eventData)
    const invoiceSyncService = new XeroInvoiceSyncService(this.user, this.connection)
    return await invoiceSyncService.voidInvoice(data.id)
  }

  private handleInvoiceDeleted = async (eventData: unknown) => {
    logger.info('WebhookService#handleInvoiceDeleted :: Handling invoice deleted')

    const data = InvoiceModifiedEventSchema.parse(eventData)
    const invoiceSyncService = new XeroInvoiceSyncService(this.user, this.connection)
    return await invoiceSyncService.deleteInvoice(data.id)
  }

  private handleProductUpdated = async (eventData: unknown) => {
    logger.info('handleProductUpdated :: Handling product updated for data')

    const isSyncAutomaticallyEnabled = await this.checkAutomaticProductSyncEnabled()
    if (!isSyncAutomaticallyEnabled) {
      throw new APIError(
        'Sync Products Automatically is disabled, cannot create synced item for new price',
        status.OK,
      )
    }

    const { id, name, description } = ProductUpdatedEventSchema.parse(eventData)
    const syncedItemsService = new SyncedItemsService(this.user, this.connection)
    const payload = {
      name,
      description: htmlToText(description),
    } satisfies ItemUpdatePayload

    const items = await syncedItemsService.updateSyncedItemsForProductId(
      id,
      ItemUpdatePayloadSchema.parse(payload),
    )
    return { items }
  }

  private handlePriceCreated = async (eventData: unknown) => {
    logger.info('WebhookService#handleInvoiceCreated :: Handling price created')

    const isSyncAutomaticallyEnabled = await this.checkAutomaticProductSyncEnabled()
    if (!isSyncAutomaticallyEnabled) {
      throw new APIError(
        'Sync Products Automatically is disabled, cannot create synced item for new price',
        status.OK,
      )
    }

    const data = PriceCreatedEventSchema.parse(eventData)
    const syncedItemsService = new SyncedItemsService(this.user, this.connection)
    const [newPrice] = await syncedItemsService.createSyncedItemsForPrices([data])
    return newPrice
  }

  private handlePaymentSucceeded = async (eventData: unknown) => {
    await sleep(4000) // Gharelu upachar for race condition when deadline is near

    logger.info(
      'WebhookService#handlePaymentSucceeded :: Handling payment succeeded for',
      eventData,
    )

    const data = PaymentSucceededEventSchema.parse(eventData)
    const settingsService = new SettingsService(this.user, this.connection)
    const { addAbsorbedFees } = await settingsService.getOrCreateSettings()
    if (!addAbsorbedFees) {
      logger.info(
        'WebhookService#handlePaymentSucceeded :: addAbsorbedFees is disabled, skipping fee addition',
      )
      return
    }

    const syncedPaymentsService = new SyncedPaymentsService(this.user, this.connection)
    const expensePayment = await syncedPaymentsService.createPlatformExpensePayment(data)

    return expensePayment
  }

  private checkAutomaticProductSyncEnabled = async (): Promise<boolean> => {
    const settingsService = new SettingsService(this.user, this.connection)
    const settings = await settingsService.getOrCreateSettings()
    logger.info(
      'WebhookService#checkAutomaticProductSyncEnabled :: Sync Products Automatically is set to',
      settings.syncProductsAutomatically,
    )
    return settings.syncProductsAutomatically
  }
}

export default WebhookService
