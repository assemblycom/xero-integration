import productUpdatedPayload from '@test/fixtures/productUpdated.webhook'
import { TEST_PORTAL, TEST_PRODUCT, TEST_XERO_ITEM } from '@test/helpers/constants'
import { seedConnectedPortal, seedSyncedItem } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — product.updated', () => {
  const apis = setupWebhookTest()

  it('updates the mapped Xero item with sanitized fields and logs the sync as successful', async () => {
    await seedConnectedPortal()
    await seedSyncedItem()

    const res = await postWebhook(productUpdatedPayload)
    expect(res.status).toBe(200)

    // Xero item updated once, with the code from the items map and the
    // HTML-stripped description.
    expect(apis.xero.updateItem).toHaveBeenCalledTimes(1)
    const [tenantId, itemId, itemUpdate] = apis.xero.updateItem.mock.calls[0]
    expect(tenantId).toBe(TEST_PORTAL.tenantId)
    expect(itemId).toBe(TEST_XERO_ITEM.id)
    expect(itemUpdate).toMatchObject({
      code: TEST_XERO_ITEM.code,
      name: 'Updated Product',
      description: 'Updated description here',
    })

    // Mapping row is left untouched — update never re-maps.
    const items = await db.select().from(syncedItems)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      productId: TEST_PRODUCT.id,
      itemId: TEST_XERO_ITEM.id,
    })

    // Success sync log written for the update.
    const logs = await db.select().from(syncLogs).where(eq(syncLogs.copilotId, TEST_PRODUCT.id))
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      entityType: SyncEntityType.PRODUCT,
      eventType: SyncEventType.UPDATED,
      status: SyncStatus.SUCCESS,
      xeroId: TEST_XERO_ITEM.id,
      productName: 'Updated Product',
      xeroItemName: 'Xero Item Name',
    })

    // No failure recorded on the happy path.
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
