import productUpdatedPayload from '@test/fixtures/productUpdated.webhook'
import { TEST_PORTAL, TEST_PRODUCT, TEST_XERO_ITEM } from '@test/helpers/constants'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedItem } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

// The product is still mapped locally, but the Xero item is gone (deleted
// upstream), so getItemsMap has no entry for it. Reading its code throws before
// updateItem runs; the failure is recorded and rethrown (500).
describe('POST /api/webhook — product.updated (mapped Xero item missing)', () => {
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      getItemsMap: vi.fn().mockResolvedValue({}),
    }),
  }))

  it('records a FAILED sync log + failed_syncs and returns 500 without calling updateItem', async () => {
    await seedConnectedPortal()
    await seedSyncedItem()

    const res = await postWebhook(productUpdatedPayload)
    expect(res.status).toBe(500)

    // The missing code is read before updateItem is invoked.
    expect(apis.xero.updateItem).not.toHaveBeenCalled()

    const logs = await db.select().from(syncLogs).where(eq(syncLogs.copilotId, TEST_PRODUCT.id))
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      entityType: SyncEntityType.PRODUCT,
      eventType: SyncEventType.UPDATED,
      status: SyncStatus.FAILED,
    })
    expect(logs[0].errorMessage).toContain('Failed to update synced item')

    const failed = await db
      .select()
      .from(failedSyncs)
      .where(eq(failedSyncs.resourceId, TEST_PRODUCT.id))
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      type: 'product.updated',
      resourceId: TEST_PRODUCT.id,
    })

    // Update never touches synced_items, so the mapping survives the failure.
    const items = await db.select().from(syncedItems)
    expect(items).toHaveLength(1)
    expect(items[0].itemId).toBe(TEST_XERO_ITEM.id)
  })
})
