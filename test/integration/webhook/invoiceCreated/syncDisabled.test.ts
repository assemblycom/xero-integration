import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'

describe('POST /api/webhook — invoice.created sync disabled', () => {
  const apis = setupWebhookTest()

  it('short-circuits at the controller when sync is disabled', async () => {
    await seedConnectedPortal({ settings: { isSyncEnabled: false } })

    const res = await postWebhook(buildInvoiceCreatedWebhook())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ message: 'Sync is disabled for this workspace' })

    // Handler never runs.
    expect(apis.xero.createInvoice).not.toHaveBeenCalled()
    expect(await db.select().from(syncedInvoices)).toHaveLength(0)
  })
})
