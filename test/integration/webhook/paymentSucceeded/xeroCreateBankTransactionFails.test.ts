import { ValidWebhookEvent } from '@invoice-sync/types'
import { buildPaymentSucceededWebhook } from '@test/fixtures/paymentSucceeded.webhook'
import { TEST_FEE, TEST_INVOICE, TEST_PAYMENT } from '@test/helpers/constants'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEntityType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — payment.succeeded Xero failure', () => {
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      createBankTransaction: vi.fn().mockRejectedValue(new Error('Xero 500: transaction rejected')),
    }),
  }))

  it('records failure in sync_logs and failed_syncs, and returns 500', async () => {
    await seedConnectedPortal({ settings: { addAbsorbedFees: true } })
    await seedSyncedInvoice({ status: 'success' })

    const res = await postWebhook(buildPaymentSucceededWebhook())
    expect(res.status).toBe(500)

    expect(apis.xero.createBankTransaction).toHaveBeenCalledTimes(1)

    // No payment row is written on failure.
    expect(await db.select().from(syncedPayments)).toHaveLength(0)

    // A failed expense sync log is written from the failedSyncLogPayload.
    const expenseLogs = await db
      .select()
      .from(syncLogs)
      .where(
        and(
          eq(syncLogs.entityType, SyncEntityType.EXPENSE),
          eq(syncLogs.status, SyncStatus.FAILED),
        ),
      )
    expect(expenseLogs).toHaveLength(1)
    expect(expenseLogs[0]).toMatchObject({
      copilotId: TEST_INVOICE.id,
      feeAmount: TEST_FEE.dollarsString,
    })

    // A failed_syncs row is recorded for retry, keyed by the payment id.
    const failed = await db.select().from(failedSyncs)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      type: ValidWebhookEvent.PaymentSucceeded,
      resourceId: TEST_PAYMENT.id,
    })
  })
})
