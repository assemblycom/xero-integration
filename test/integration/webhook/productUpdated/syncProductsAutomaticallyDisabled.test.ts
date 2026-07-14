import productUpdatedPayload from '@test/fixtures/productUpdated.webhook'
import { TEST_XERO_ITEM } from '@test/helpers/constants'
import { seedConnectedPortal, seedSyncedItem } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

// Workspace sync is on, but automatic product sync is off, so the handler throws
// APIError(OK) which handleEvent swallows. The product stays mapped but is not
// pushed to Xero.
describe('POST /api/webhook — product.updated (syncProductsAutomatically=false)', () => {
  const apis = setupWebhookTest()

  it('returns 200 without updating the Xero item or writing any rows', async () => {
    await seedConnectedPortal({ settings: { syncProductsAutomatically: false } })
    await seedSyncedItem()

    const res = await postWebhook(productUpdatedPayload)
    expect(res.status).toBe(200)

    expect(apis.xero.updateItem).not.toHaveBeenCalled()

    // The seeded mapping stays put — the gate skips before touching synced_items.
    const items = await db.select().from(syncedItems)
    expect(items).toHaveLength(1)
    expect(items[0].itemId).toBe(TEST_XERO_ITEM.id)

    expect(await db.select().from(syncLogs)).toHaveLength(0)
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
