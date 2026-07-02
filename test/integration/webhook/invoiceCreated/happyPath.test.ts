import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import {
  TEST_CLIENT,
  TEST_INVOICE,
  TEST_PORTAL,
  TEST_SALES_ACCOUNT,
  TEST_XERO_CONTACT,
  TEST_XERO_INVOICE,
} from '@test/helpers/constants'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'
import { ReportTaxType } from '@/lib/xero/region'

// Region-specific expectations. Sales-account code and tax reportTaxType are the
// two observable US/AU differences in the invoice.created flow.
const REGIONS = [
  { countryCode: 'US', salesCode: '4000', reportTaxType: undefined },
  { countryCode: 'AU', salesCode: '9000', reportTaxType: ReportTaxType.OUTPUT },
] as const

describe.each(REGIONS)('POST /api/webhook — invoice.created [$countryCode]', (region) => {
  const apis = setupWebhookTest()

  it('creates a Xero contact + invoice, maps synced_invoices, and logs success', async () => {
    await seedConnectedPortal({ settings: { countryCode: region.countryCode } })

    const res = await postWebhook(buildInvoiceCreatedWebhook())
    expect(res.status).toBe(200)

    // New contact created for the client (no synced contact seeded).
    expect(apis.xero.createContact).toHaveBeenCalledTimes(1)
    expect(apis.xero.getContact).not.toHaveBeenCalled()

    // Sales account created with the region's code.
    expect(apis.xero.createSalesAccount).toHaveBeenCalledTimes(1)
    expect(apis.xero.createSalesAccount.mock.calls[0][1]).toMatchObject({ code: region.salesCode })

    // Tax rate created with the region's reportTaxType.
    expect(apis.xero.createTaxRate).toHaveBeenCalledTimes(1)
    expect(apis.xero.createTaxRate.mock.calls[0][1].reportTaxType).toBe(region.reportTaxType)

    // Invoice created once for the tenant, lines posted to the region's sales code.
    expect(apis.xero.createInvoice).toHaveBeenCalledTimes(1)
    const [tenantId, invoice] = apis.xero.createInvoice.mock.calls[0]
    expect(tenantId).toBe(TEST_PORTAL.tenantId)
    expect(invoice).toMatchObject({
      type: 'ACCREC',
      status: 'AUTHORISED',
      invoiceNumber: TEST_INVOICE.number,
      contact: { contactID: TEST_XERO_CONTACT.id },
    })
    expect(invoice.lineItems).toHaveLength(1)
    expect(invoice.lineItems[0].accountCode).toBe(region.salesCode)

    // synced_invoices row marked success and mapped to the Xero invoice.
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      copilotInvoiceId: TEST_INVOICE.id,
      xeroInvoiceId: TEST_XERO_INVOICE.id,
      salesAccountId: TEST_SALES_ACCOUNT.id,
      status: 'success',
    })

    // Success sync log written for the invoice.
    const logs = await db.select().from(syncLogs).where(eq(syncLogs.copilotId, TEST_INVOICE.id))
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      entityType: SyncEntityType.INVOICE,
      eventType: SyncEventType.CREATED,
      status: SyncStatus.SUCCESS,
      xeroId: TEST_XERO_INVOICE.id,
      invoiceNumber: TEST_INVOICE.number,
      customerEmail: TEST_CLIENT.email,
      customerName: `${TEST_CLIENT.givenName} ${TEST_CLIENT.familyName}`,
    })

    // No failure recorded on the happy path.
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
