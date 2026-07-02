import productCreatedPayload from '@test/fixtures/productCreated.webhook'
import { TEST_PORTAL, TEST_PRODUCT } from '@test/helpers/constants'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

// createItems throws → no mapping row, but a FAILED sync log and a failed_syncs
// record are written before the error is rethrown (500).
describe('POST /api/webhook — product.created (Xero createItems fails)', () => {
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      createItems: vi.fn().mockRejectedValue(new Error('Xero is on fire')),
    }),
  }))

  it('writes no mapping row, records a FAILED sync log + failed_syncs, and returns 500', async () => {
    await seedConnectedPortal()

    const res = await postWebhook(productCreatedPayload)
    expect(res.status).toBe(500)

    // Got far enough to attempt item creation.
    expect(apis.xero.createItems).toHaveBeenCalledTimes(1)

    // No mapping row persisted.
    expect(await db.select().from(syncedItems)).toHaveLength(0)

    // FAILED sync log written.
    const logs = await db.select().from(syncLogs).where(eq(syncLogs.copilotId, TEST_PRODUCT.id))
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      entityType: SyncEntityType.PRODUCT,
      eventType: SyncEventType.CREATED,
      status: SyncStatus.FAILED,
      productName: 'Test Product',
    })
    expect(logs[0].errorMessage).toContain('Failed to create synced item')

    // failed_syncs record queued for retry.
    const failed = await db
      .select()
      .from(failedSyncs)
      .where(eq(failedSyncs.resourceId, TEST_PRODUCT.id))
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      type: 'product.created',
      resourceId: TEST_PRODUCT.id,
    })
  })
})
