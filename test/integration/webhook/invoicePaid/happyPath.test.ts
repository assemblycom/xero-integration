import { buildPaidInvoiceWebhook } from '@test/fixtures/paidInvoice.webhook'
import {
  TEST_CLIENT,
  TEST_INVOICE,
  TEST_PORTAL,
  TEST_XERO_INVOICE,
  TEST_XERO_PAYMENT,
} from '@test/helpers/constants'
import { seedConnectedPortal, seedSyncedInvoice, seedSyncLog } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

// Region-specific expectation: the sales-account code posted with the payment.
// With getAccounts=[] the stored account isn't found, so resolution falls
// through to the region-default account, whose code differs US vs AU.
const REGIONS = [
  { countryCode: 'US', salesCode: '4000' },
  { countryCode: 'AU', salesCode: '9000' },
] as const

describe.each(REGIONS)('POST /api/webhook — invoice.paid [$countryCode]', (region) => {
  const apis = setupWebhookTest()

  it('creates a Xero payment, records synced_payments, and logs the paid event', async () => {
    await seedConnectedPortal({ settings: { countryCode: region.countryCode } })
    await seedSyncedInvoice({ status: 'success' })
    await seedSyncLog()

    const res = await postWebhook(buildPaidInvoiceWebhook())
    expect(res.status).toBe(200)

    // Xero invoice fetched, then the payment created against the region's sales code.
    expect(apis.xero.getInvoiceById).toHaveBeenCalledTimes(1)
    expect(apis.xero.markInvoicePaid).toHaveBeenCalledTimes(1)
    const [tenantId, xeroInvoiceId, amount, salesCode] = apis.xero.markInvoicePaid.mock.calls[0]
    expect(tenantId).toBe(TEST_PORTAL.tenantId)
    expect(xeroInvoiceId).toBe(TEST_XERO_INVOICE.id)
    expect(amount).toBe(TEST_XERO_INVOICE.total)
    expect(salesCode).toBe(region.salesCode)

    // synced_payments row created for the invoice payment.
    const payments = await db.select().from(syncedPayments)
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      copilotInvoiceId: TEST_INVOICE.id,
      xeroInvoiceId: TEST_XERO_INVOICE.id,
      xeroPaymentId: TEST_XERO_PAYMENT.id,
      copilotPaymentId: null,
      type: 'payment',
    })

    // Invoice stays success.
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({ copilotInvoiceId: TEST_INVOICE.id, status: 'success' })

    // A paid success sync log written, carrying the created log's invoice fields.
    const paidLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.PAID))
    expect(paidLogs).toHaveLength(1)
    expect(paidLogs[0]).toMatchObject({
      status: SyncStatus.SUCCESS,
      invoiceNumber: TEST_INVOICE.number,
      customerName: `${TEST_CLIENT.givenName} ${TEST_CLIENT.familyName}`,
    })

    // No failure recorded on the happy path.
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
