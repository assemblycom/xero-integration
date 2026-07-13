import { buildPaymentSucceededWebhook } from '@test/fixtures/paymentSucceeded.webhook'
import { TEST_PAYMENT } from '@test/helpers/constants'
import { seedConnectedPortal, seedSyncedInvoice, seedSyncedPayment } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { PaymentUserType, syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEntityType, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — payment.succeeded idempotency', () => {
  const apis = setupWebhookTest()

  it('skips creating an expense when one already exists for the payment', async () => {
    await seedConnectedPortal({ settings: { addAbsorbedFees: true } })
    await seedSyncedInvoice({ status: 'success' })
    // An EXPENSE row already recorded for this Copilot payment id.
    await seedSyncedPayment({
      type: PaymentUserType.EXPENSE,
      copilotPaymentId: TEST_PAYMENT.id,
    })

    const res = await postWebhook(buildPaymentSucceededWebhook())
    expect(res.status).toBe(200)

    // Replay guard short-circuits before any Xero write.
    expect(apis.xero.createBankTransaction).not.toHaveBeenCalled()

    // Still exactly one payment row, and no expense sync log was added.
    expect(await db.select().from(syncedPayments)).toHaveLength(1)
    const expenseLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.entityType, SyncEntityType.EXPENSE))
    expect(expenseLogs).toHaveLength(0)
  })
})
