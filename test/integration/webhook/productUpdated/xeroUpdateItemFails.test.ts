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

// updateItem throws → the service wraps it in an APIError with a FAILED sync-log
// payload, and handleEvent records both a FAILED sync log and a failed_syncs
// record before rethrowing (500).
describe('POST /api/webhook — product.updated (Xero updateItem fails)', () => {
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      updateItem: vi.fn().mockRejectedValue(new Error('Xero is on fire')),
    }),
  }))

  it('records a FAILED sync log + failed_syncs and returns 500', async () => {
    await seedConnectedPortal()
    await seedSyncedItem()

    const res = await postWebhook(productUpdatedPayload)
    expect(res.status).toBe(500)

    // Got far enough to attempt the update.
    expect(apis.xero.updateItem).toHaveBeenCalledTimes(1)

    // FAILED sync log written.
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

    // failed_syncs record queued for retry.
    const failed = await db
      .select()
      .from(failedSyncs)
      .where(eq(failedSyncs.resourceId, TEST_PRODUCT.id))
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      type: 'product.updated',
      resourceId: TEST_PRODUCT.id,
    })

    // Update never touches synced_items, so the mapping survives the failure.
    const items = await db.select().from(syncedItems)
    expect(items).toHaveLength(1)
    expect(items[0].itemId).toBe(TEST_XERO_ITEM.id)
  })
})
