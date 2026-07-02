import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import { TEST_INVOICE } from '@test/helpers/constants'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.created idempotency', () => {
  const apis = setupWebhookTest()

  it('skips Xero and writes no new log when the invoice is already synced', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })

    const res = await postWebhook(buildInvoiceCreatedWebhook())
    expect(res.status).toBe(200)

    // Already-synced record short-circuits before the whole sync fan-out, so no
    // Xero call — contact, tax, account, or invoice — is reached.
    expect(apis.xero.createInvoice).not.toHaveBeenCalled()
    expect(apis.xero.createContact).not.toHaveBeenCalled()
    expect(apis.xero.createSalesAccount).not.toHaveBeenCalled()
    expect(apis.xero.getTaxRates).not.toHaveBeenCalled()
    expect(apis.xero.createTaxRate).not.toHaveBeenCalled()

    // Still exactly one invoice row, and no invoice.created sync log was added.
    expect(await db.select().from(syncedInvoices)).toHaveLength(1)
    const logs = await db.select().from(syncLogs).where(eq(syncLogs.copilotId, TEST_INVOICE.id))
    expect(logs).toHaveLength(0)
  })
})
