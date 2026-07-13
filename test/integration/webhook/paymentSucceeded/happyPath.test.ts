import { buildPaymentSucceededWebhook } from '@test/fixtures/paymentSucceeded.webhook'
import {
  TEST_FEE,
  TEST_INVOICE,
  TEST_PAYMENT,
  TEST_PORTAL,
  TEST_XERO_BANK_TXN,
  TEST_XERO_INVOICE,
} from '@test/helpers/constants'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

// Absorbed-fee account codes; differ US vs AU.
const REGIONS = [
  { countryCode: 'US', bankCode: '2001', feesCode: '6041' },
  { countryCode: 'AU', bankCode: '9010', feesCode: '9020' },
] as const

describe.each(REGIONS)('POST /api/webhook — payment.succeeded [$countryCode]', (region) => {
  const apis = setupWebhookTest()

  it('creates a SPEND expense, records synced_payments, and logs the expense', async () => {
    await seedConnectedPortal({
      settings: { countryCode: region.countryCode, addAbsorbedFees: true },
    })
    await seedSyncedInvoice({ status: 'success' })

    const res = await postWebhook(buildPaymentSucceededWebhook())
    expect(res.status).toBe(200)

    // One SPEND transaction referencing the payment id, fee from TEST_FEE, region codes.
    expect(apis.xero.createBankTransaction).toHaveBeenCalledTimes(1)
    const [tenantId, payload, idempotencyKey] = apis.xero.createBankTransaction.mock.calls[0]
    expect(tenantId).toBe(TEST_PORTAL.tenantId)
    expect(idempotencyKey).toBe(TEST_PAYMENT.id)
    expect(payload).toMatchObject({
      type: 'SPEND',
      reference: TEST_PAYMENT.id,
      bankAccount: { code: region.bankCode },
      contact: { name: 'Assembly Processing Fees' },
      lineItems: [{ accountCode: region.feesCode, quantity: 1, unitAmount: TEST_FEE.dollars }],
    })

    // An EXPENSE synced_payments row keyed by the Copilot payment id.
    const payments = await db.select().from(syncedPayments)
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      copilotInvoiceId: TEST_INVOICE.id,
      xeroInvoiceId: TEST_XERO_INVOICE.id,
      xeroPaymentId: TEST_XERO_BANK_TXN.id,
      copilotPaymentId: TEST_PAYMENT.id,
      type: 'expense',
    })

    // An expense created-success sync log carrying the fee amount.
    const expenseLogs = await db
      .select()
      .from(syncLogs)
      .where(
        and(
          eq(syncLogs.entityType, SyncEntityType.EXPENSE),
          eq(syncLogs.eventType, SyncEventType.CREATED),
        ),
      )
    expect(expenseLogs).toHaveLength(1)
    expect(expenseLogs[0]).toMatchObject({
      status: SyncStatus.SUCCESS,
      copilotId: TEST_INVOICE.id,
      xeroId: TEST_XERO_BANK_TXN.id,
      amount: TEST_FEE.dollarsString,
      feeAmount: TEST_FEE.dollarsString,
    })

    // No failure recorded on the happy path.
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
