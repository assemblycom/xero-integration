import { buildPaymentSucceededWebhook } from '@test/fixtures/paymentSucceeded.webhook'
import { TEST_XERO_BANK_TXN } from '@test/helpers/constants'
import { seedConnectedPortal, seedSyncedInvoice, seedSyncedPayment } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEntityType, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — payment.succeeded concurrent duplicate', () => {
  const apis = setupWebhookTest()

  it('returns the transaction but skips the sync log when the insert no-ops', async () => {
    await seedConnectedPortal({ settings: { addAbsorbedFees: true } })
    await seedSyncedInvoice({ status: 'success' })
    // Seed a row with the same xeroPaymentId. It dodges the EXPENSE replay guard
    // but collides on the unique index, so the insert no-ops — the race-guard branch.
    await seedSyncedPayment({ xeroPaymentId: TEST_XERO_BANK_TXN.id })

    const res = await postWebhook(buildPaymentSucceededWebhook())
    expect(res.status).toBe(200)

    // A create was attempted (guard missed), but the insert conflicted.
    expect(apis.xero.createBankTransaction).toHaveBeenCalledTimes(1)

    // Still just the seeded row; no expense sync log because the insert no-op'd.
    expect(await db.select().from(syncedPayments)).toHaveLength(1)
    const expenseLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.entityType, SyncEntityType.EXPENSE))
    expect(expenseLogs).toHaveLength(0)
  })
})
