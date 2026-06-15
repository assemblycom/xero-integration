import 'server-only'

import type { ProductCreatedEvent } from '@invoice-sync/types'
import type { Mappable } from '@items-sync/types'
import { SyncLogsService } from '@sync-logs/lib/SyncLogs.service'
import { and, eq, inArray } from 'drizzle-orm'
import status from 'http-status'
import type { Item } from 'xero-node'
import z from 'zod'
import { getTableFields } from '@/db/db.helpers'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { SyncEntityType, SyncEventType, SyncStatus } from '@/db/schema/syncLogs.schema'
import APIError from '@/errors/APIError'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import type { ItemUpdatePayload } from '@/lib/xero/types'
import { htmlToText } from '@/utils/html'
import { genRandomString } from '@/utils/string'

class SyncedItemsService extends AuthenticatedXeroService {
  async createItems(itemsToCreate: Item[], productIdForCode: Record<string, string>) {
    logger.info(
      'SyncedItemsService#createItems :: Creating items:',
      itemsToCreate,
      productIdForCode,
    )

    if (!itemsToCreate.length) return []

    const newlyCreatedItems = await this.xero.createItems(this.connection.tenantId, itemsToCreate)
    await this.db
      .insert(syncedItems)
      .values(
        newlyCreatedItems.map((item) => {
          const insertPayload = {
            portalId: this.user.portalId,
            productId: productIdForCode[item.code],
            itemId: z.uuid().parse(item.itemID),
            tenantId: this.connection.tenantId,
          }
          logger.info(
            'SyncedItemsService#createItems :: Inserting synced item record:',
            insertPayload,
          )
          return insertPayload
        }),
      )
      // One item per product: ignore if this product was already mapped (race safety)
      .onConflictDoNothing()
    return newlyCreatedItems
  }

  /**
   * Returns a list of Mappable items where the key is the productId
   */
  async getSyncedItemsMapByProductIds(
    productIds: string[] | 'all',
  ): Promise<Record<string, Mappable>> {
    logger.info(
      'SyncedItemsService#getSyncedItemsMapByProductIds :: Getting synced items map for productIds',
      productIds,
    )

    const dbMappings = await this.db
      .select(getTableFields(syncedItems, ['productId', 'itemId']))
      .from(syncedItems)
      .where(
        and(
          eq(syncedItems.portalId, this.user.portalId),
          eq(syncedItems.tenantId, this.connection.tenantId),
          productIds === 'all' ? undefined : inArray(syncedItems.productId, productIds),
        ),
      )
    return dbMappings.reduce<Record<string, (typeof dbMappings)[0]>>((acc, mapping) => {
      acc[mapping.productId] = mapping
      return acc
    }, {})
  }

  async updateSyncedItemsForProductId(
    productId: string,
    payload: ItemUpdatePayload,
  ): Promise<Item[]> {
    logger.info(
      'SyncedItemsService#updateSyncedItemsForProductId :: Updating synced items map for product',
      productId,
      'with payload',
      payload,
    )

    const syncedItemRecords = await this.db
      .select()
      .from(syncedItems)
      .where(
        and(
          eq(syncedItems.portalId, this.user.portalId),
          eq(syncedItems.tenantId, this.connection.tenantId),
          eq(syncedItems.productId, productId),
        ),
      )
    if (!syncedItemRecords.length) {
      logger.info(
        'SyncedItemsService#updateXeroItemsForProductId :: Did not find any synced products. Ignoring.',
      )
      return []
    }

    const items: Item[] = []
    const xeroItemsMap = await this.xero.getItemsMap(this.connection.tenantId)

    const syncLogsService = new SyncLogsService(this.user, this.connection)

    for (const item of syncedItemRecords) {
      try {
        // This is a bit slower but since this is an async task, it hardly matters
        const updatedItem = await this.xero.updateItem(this.connection.tenantId, item.itemId, {
          code: xeroItemsMap[item.itemId].code,
          ...payload,
        })
        items.push(updatedItem)

        const { copilotProduct, xeroItem } = await this.getCopilotProductAndXeroItem(
          item.productId,
          item.itemId,
        )

        await syncLogsService.createSyncLog({
          entityType: SyncEntityType.PRODUCT,
          eventType: SyncEventType.UPDATED,
          status: SyncStatus.SUCCESS,
          syncDate: new Date(),
          copilotId: productId,
          xeroId: item.itemId,
          xeroItemName: xeroItem?.name,
          productName: copilotProduct?.name,
        })
      } catch (error: unknown) {
        throw new APIError('Failed to update synced item', status.INTERNAL_SERVER_ERROR, {
          error,
          failedSyncLogPayload: {
            entityType: SyncEntityType.PRODUCT,
            eventType: SyncEventType.UPDATED,
            copilotId: productId,
            xeroId: item.itemId,
          },
        })
      }
    }
    return items
  }

  async createSyncedItemsForProducts(products: ProductCreatedEvent[]): Promise<Item[]> {
    logger.info(
      'SyncedItemsService#createSyncedItemsForProducts :: Creating synced items for products',
      products,
    )
    const createdItems: Item[] = []

    // One Xero Item per product: skip products that are already mapped
    const existingMappings = await this.getSyncedItemsMapByProductIds(products.map((p) => p.id))

    for (const product of products) {
      if (existingMappings[product.id]) {
        logger.info(
          'SyncedItemsService#createSyncedItemsForProducts :: Product already mapped, skipping',
          product.id,
        )
        continue
      }

      // No unitPrice: created items carry no price, invoice lines always supply it
      const payload = {
        code: genRandomString(12),
        name: product.name,
        description: htmlToText(product.description),
        isPurchased: false,
      }

      const syncLogsService = new SyncLogsService(this.user, this.connection)

      try {
        const items = await this.createItems([payload], { [payload.code]: product.id })
        createdItems.push(items[0])

        await syncLogsService.createSyncLog({
          entityType: SyncEntityType.PRODUCT,
          eventType: SyncEventType.CREATED,
          status: SyncStatus.SUCCESS,
          syncDate: new Date(),
          copilotId: product.id,
          xeroId: items[0].itemID,
          xeroItemName: items[0].name,
          productName: product.name,
        })
      } catch (error: unknown) {
        throw new APIError(
          'Failed to create synced item for product',
          status.INTERNAL_SERVER_ERROR,
          {
            error,
            failedSyncLogPayload: {
              entityType: SyncEntityType.PRODUCT,
              eventType: SyncEventType.CREATED,
              copilotId: product.id,
              productName: product.name,
            },
          },
        )
      }
    }
    return createdItems
  }

  async addSyncedItems(items: Mappable[]) {
    logger.info('SyncedItemsService#addSyncedItems :: Adding synced items', items)

    const syncLogsService = new SyncLogsService(this.user, this.connection)

    // One-by-one so we can write a sync log per mapping
    for (const item of items) {
      logger.info('SyncedItemsService#addSyncedItems :: Adding mapping', item)

      if (!item.itemId) {
        logger.warn(
          'SyncedItemsService#addSyncedItem :: Attempted to add non existant itemId for ',
          item,
        )
        continue
      }

      await this.db.insert(syncedItems).values({
        portalId: this.user.portalId,
        tenantId: this.connection.tenantId,
        productId: item.productId,
        itemId: item.itemId,
      })

      const { copilotProduct, xeroItem } = await this.getCopilotProductAndXeroItem(
        item.productId,
        item.itemId,
      )
      await syncLogsService.createSyncLog({
        entityType: SyncEntityType.PRODUCT,
        eventType: SyncEventType.MAPPED,
        status: SyncStatus.SUCCESS,
        syncDate: new Date(),
        copilotId: item.productId,
        xeroId: item.itemId,
        productName: copilotProduct?.name,
        xeroItemName: xeroItem?.name,
      })
    }
  }

  async deleteSyncedItems(items: Mappable[]) {
    logger.info('SyncedItemsService#deleteSyncedItems :: Deleting synced items', items)
    const syncLogsService = new SyncLogsService(this.user, this.connection)

    // One-by-one so we can write a sync log per unmapping
    for (const item of items) {
      logger.info('SyncedItemsService#deleteSyncedItems :: Deleting mapping', item)

      if (!item.itemId) {
        logger.warn(
          'SyncedItemsService#deleteSyncedItem :: Attempted to delete non existant itemId for ',
          item,
        )
        continue
      }

      await this.db
        .delete(syncedItems)
        .where(
          and(
            eq(syncedItems.portalId, this.user.portalId),
            eq(syncedItems.tenantId, this.connection.tenantId),
            eq(syncedItems.productId, item.productId),
            eq(syncedItems.itemId, item.itemId),
          ),
        )
      const { copilotProduct, xeroItem } = await this.getCopilotProductAndXeroItem(
        item.productId,
        item.itemId,
      )
      await syncLogsService.createSyncLog({
        entityType: SyncEntityType.PRODUCT,
        eventType: SyncEventType.UNMAPPED,
        status: SyncStatus.INFO,
        syncDate: new Date(),
        copilotId: item.productId,
        xeroId: item.itemId,
        productName: copilotProduct?.name,
        xeroItemName: xeroItem?.name,
      })
    }
  }

  private async getCopilotProductAndXeroItem(productId: string, itemId: string) {
    try {
      const [copilotProductMap, xeroItemMap] = await Promise.all([
        this.copilot.getProductsMapById([productId]),
        this.xero.getItemsMap(this.connection.tenantId),
      ])
      const copilotProduct = copilotProductMap[productId]
      const xeroItem = xeroItemMap[itemId]
      return { copilotProduct, xeroItem }
    } catch (_) {
      return { copilotProduct: null, xeroItem: null }
    }
  }
}

export default SyncedItemsService
