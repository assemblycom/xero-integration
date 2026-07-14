import productUpdatedPayload from '@test/fixtures/productUpdated.webhook'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

// Sync is on but the product has no synced_items row, so the service short
// circuits with an empty result: no Xero call, no logs, no failure.
describe('POST /api/webhook — product.updated (product not mapped)', () => {
  const apis = setupWebhookTest()

  it('returns 200 without calling Xero or writing any rows', async () => {
    await seedConnectedPortal()

    const res = await postWebhook(productUpdatedPayload)
    expect(res.status).toBe(200)

    expect(apis.xero.updateItem).not.toHaveBeenCalled()
    expect(await db.select().from(syncLogs)).toHaveLength(0)
    expect(await db.select().from(syncedItems)).toHaveLength(0)
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
