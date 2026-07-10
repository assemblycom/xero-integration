import { buildDeletedInvoiceWebhook } from '@test/fixtures/deletedInvoice.webhook'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'

describe('POST /api/webhook — invoice.deleted sync disabled', () => {
  const apis = setupWebhookTest()

  it('short-circuits at the controller when sync is disabled', async () => {
    await seedConnectedPortal({ settings: { isSyncEnabled: false } })
    await seedSyncedInvoice({ status: 'success' })

    const res = await postWebhook(buildDeletedInvoiceWebhook())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ message: 'Sync is disabled for this workspace' })

    // Handler never runs.
    expect(apis.xero.voidInvoice).not.toHaveBeenCalled()
    expect(apis.xero.deleteInvoice).not.toHaveBeenCalled()
  })
})
