import productCreatedPayload from '@test/fixtures/productCreated.webhook'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

// Workspace sync is off, so the controller stops before dispatching the event.
// This is a different gate from syncProductsAutomatically.
describe('POST /api/webhook — product.created (isSyncEnabled=false)', () => {
  const apis = setupWebhookTest()

  it('returns 200 without creating a Xero item or writing any rows', async () => {
    await seedConnectedPortal({ settings: { isSyncEnabled: false } })

    const res = await postWebhook(productCreatedPayload)
    expect(res.status).toBe(200)

    expect(apis.xero.createItems).not.toHaveBeenCalled()

    expect(await db.select().from(syncedItems)).toHaveLength(0)
    expect(await db.select().from(syncLogs)).toHaveLength(0)
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
