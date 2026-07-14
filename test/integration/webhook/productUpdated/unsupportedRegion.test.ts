import productUpdatedPayload from '@test/fixtures/productUpdated.webhook'
import { seedConnectedPortal, seedSyncedItem } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — product.updated unsupported region', () => {
  const apis = setupWebhookTest()

  it('acks and skips when the Xero region is unsupported', async () => {
    // GB is unsupported, so getRegionConfig returns null and handleEvent skips.
    await seedConnectedPortal({ settings: { countryCode: 'GB' } })
    await seedSyncedItem()

    const res = await postWebhook(productUpdatedPayload)
    expect(res.status).toBe(200)

    expect(apis.xero.updateItem).not.toHaveBeenCalled()
    expect(await db.select().from(syncLogs)).toHaveLength(0)
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
