import productCreatedPayload from '@test/fixtures/productCreated.webhook'
import { setupProductCreatedTest } from '@test/helpers/productCreatedTestSetup'
import {
  seedConnectedPortal,
  seedSyncedItem,
  TEST_OTHER_XERO_ITEM_ID,
  TEST_PRODUCT_ID,
} from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

// Re-sending product.created for an already-mapped product must not duplicate it.
// This covers the getSyncedItemsMapByProductIds pre-check short-circuit. The
// separate onConflictDoNothing orphan-cleanup branch in
// SyncedItemsService#createItems only fires on a true insert-time race (a row
// created between the pre-check and the insert), which can't be triggered
// deterministically here, so it is intentionally not covered.
describe('POST /api/webhook — product.created (already mapped)', () => {
  const apis = setupProductCreatedTest()

  it('skips the Xero call and writes no new rows when the product is already mapped', async () => {
    await seedConnectedPortal()
    await seedSyncedItem({ itemId: TEST_OTHER_XERO_ITEM_ID })

    const res = await postWebhook(productCreatedPayload)
    expect(res.status).toBe(200)

    // Existing-mapping check runs before any Xero call.
    expect(apis.xero.createItems).not.toHaveBeenCalled()

    // Still just the seeded row, unchanged.
    const items = await db
      .select()
      .from(syncedItems)
      .where(eq(syncedItems.productId, TEST_PRODUCT_ID))
    expect(items).toHaveLength(1)
    expect(items[0].itemId).toBe(TEST_OTHER_XERO_ITEM_ID)

    // Early return skips logging.
    expect(await db.select().from(syncLogs)).toHaveLength(0)
  })
})
