import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'

describe('POST /api/webhook — invoice.created unsupported region', () => {
  const apis = setupWebhookTest()

  it('acks and skips syncing when the Xero region is unsupported', async () => {
    // GB is not in SUPPORTED_COUNTRIES → getRegionConfig() returns null.
    await seedConnectedPortal({ settings: { countryCode: 'GB' } })

    const res = await postWebhook(buildInvoiceCreatedWebhook())
    expect(res.status).toBe(200)

    expect(apis.xero.createInvoice).not.toHaveBeenCalled()
    expect(await db.select().from(syncedInvoices)).toHaveLength(0)
  })
})
