import productCreatedPayload from '@test/fixtures/productCreated.webhook'
import { setupProductCreatedTest } from '@test/helpers/productCreatedTestSetup'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

// Service-level gate: sync is enabled for the workspace, but automatic product
// sync is off. See isSyncDisabled.test.ts for the controller-level gate.
describe('POST /api/webhook — product.created (syncProductsAutomatically=false)', () => {
  const apis = setupProductCreatedTest()

  it('returns 200 without creating a Xero item or writing any rows', async () => {
    await seedConnectedPortal({ settings: { syncProductsAutomatically: false } })

    const res = await postWebhook(productCreatedPayload)
    // Handler throws APIError with status OK, which handleEvent swallows.
    expect(res.status).toBe(200)

    expect(apis.xero.createItems).not.toHaveBeenCalled()

    expect(await db.select().from(syncedItems)).toHaveLength(0)
    expect(await db.select().from(syncLogs)).toHaveLength(0)
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
