import { buildPaymentSucceededWebhook } from '@test/fixtures/paymentSucceeded.webhook'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEntityType, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — payment.succeeded absorbed fees disabled', () => {
  const apis = setupWebhookTest()

  it('skips expense creation when addAbsorbedFees is false', async () => {
    // addAbsorbedFees defaults to false in the seed; sync is otherwise enabled.
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })

    const res = await postWebhook(buildPaymentSucceededWebhook())
    expect(res.status).toBe(200)

    expect(apis.xero.createBankTransaction).not.toHaveBeenCalled()
    expect(await db.select().from(syncedPayments)).toHaveLength(0)
    const expenseLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.entityType, SyncEntityType.EXPENSE))
    expect(expenseLogs).toHaveLength(0)
  })
})
