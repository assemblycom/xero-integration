import { buildPaidInvoiceWebhook } from '@test/fixtures/paidInvoice.webhook'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'

describe('POST /api/webhook — invoice.paid sync disabled', () => {
  const apis = setupWebhookTest()

  it('short-circuits at the controller when sync is disabled', async () => {
    await seedConnectedPortal({ settings: { isSyncEnabled: false } })
    await seedSyncedInvoice({ status: 'success' })

    const res = await postWebhook(buildPaidInvoiceWebhook())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ message: 'Sync is disabled for this workspace' })

    // Handler never runs.
    expect(apis.xero.markInvoicePaid).not.toHaveBeenCalled()
    expect(await db.select().from(syncedPayments)).toHaveLength(0)
  })
})
