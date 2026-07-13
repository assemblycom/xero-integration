import { buildPaymentSucceededWebhook } from '@test/fixtures/paymentSucceeded.webhook'
import { TEST_FEE, TEST_PAYMENT, TEST_XERO_BANK_TXN } from '@test/helpers/constants'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest, type WebhookTestHandle } from '@test/helpers/webhookTestSetup'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEntityType, SyncEventType, syncLogs } from '@/db/schema/syncLogs.schema'

const foundExpense = { bankTransactionID: TEST_XERO_BANK_TXN.id, status: 'AUTHORISED' }

// The two reuse arms of the resolution chain: findBankTransactionByReference ??
// findLegacyExpenseByInvoice ?? createBankTransaction. A hit on either reuses the
// found expense instead of creating a new transaction; only the lookup differs.
const CASES = [
  {
    label: 'by reference',
    override: () => ({ findBankTransactionByReference: vi.fn().mockResolvedValue(foundExpense) }),
    verifyLookups: (apis: WebhookTestHandle) => {
      expect(apis.xero.findBankTransactionByReference).toHaveBeenCalledTimes(1)
      // Reference hit short-circuits before the legacy lookup.
      expect(apis.xero.findLegacyExpenseByInvoice).not.toHaveBeenCalled()
    },
  },
  {
    label: 'legacy by invoice',
    override: () => ({
      findLegacyExpenseByInvoice: vi
        .fn()
        .mockResolvedValue({ ...foundExpense, total: TEST_FEE.dollars }),
    }),
    verifyLookups: (apis: WebhookTestHandle) => {
      // Reference lookup ran first and missed, so the chain fell through to legacy.
      expect(apis.xero.findBankTransactionByReference).toHaveBeenCalledTimes(1)
      expect(apis.xero.findLegacyExpenseByInvoice).toHaveBeenCalledTimes(1)
    },
  },
] as const

describe.each(CASES)(
  'POST /api/webhook — payment.succeeded reuses an expense ($label)',
  (testCase) => {
    const apis = setupWebhookTest(() => ({ xero: createMockXeroAPI(testCase.override()) }))

    it('records the found transaction and skips createBankTransaction', async () => {
      await seedConnectedPortal({ settings: { addAbsorbedFees: true } })
      await seedSyncedInvoice({ status: 'success' })

      const res = await postWebhook(buildPaymentSucceededWebhook())
      expect(res.status).toBe(200)

      testCase.verifyLookups(apis)
      expect(apis.xero.createBankTransaction).not.toHaveBeenCalled()

      const payments = await db.select().from(syncedPayments)
      expect(payments).toHaveLength(1)
      expect(payments[0]).toMatchObject({
        xeroPaymentId: TEST_XERO_BANK_TXN.id,
        copilotPaymentId: TEST_PAYMENT.id,
        type: 'expense',
      })
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
    })
  },
)
