import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import { TEST_INVOICE } from '@test/helpers/constants'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

const REGIONS = [{ countryCode: 'US' }, { countryCode: 'AU' }] as const

describe.each(REGIONS)('POST /api/webhook — invoice.created no tax [$countryCode]', (region) => {
  const apis = setupWebhookTest()

  it('creates the invoice without looking up or creating a tax rate', async () => {
    await seedConnectedPortal({ settings: { countryCode: region.countryCode } })

    const res = await postWebhook(buildInvoiceCreatedWebhook({ taxAmount: 0, taxPercentage: 0 }))
    expect(res.status).toBe(200)

    // taxAmount falsy → tax rate path skipped entirely.
    expect(apis.xero.getTaxRates).not.toHaveBeenCalled()
    expect(apis.xero.createTaxRate).not.toHaveBeenCalled()

    // Invoice still created and marked success.
    expect(apis.xero.createInvoice).toHaveBeenCalledTimes(1)
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0].status).toBe('success')

    const logs = await db.select().from(syncLogs).where(eq(syncLogs.copilotId, TEST_INVOICE.id))
    expect(logs).toHaveLength(1)
    expect(logs[0].status).toBe(SyncStatus.SUCCESS)
  })
})
