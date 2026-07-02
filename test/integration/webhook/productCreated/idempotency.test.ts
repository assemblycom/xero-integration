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
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

// Re-sending product.created for a mapped product must not duplicate it. This
// hits the pre-check that skips mapped products. The insert-time conflict branch
// only fires on a real race, so it's left uncovered on purpose.
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

    // Early return skips both logging and failure recording.
    expect(await db.select().from(syncLogs)).toHaveLength(0)
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
