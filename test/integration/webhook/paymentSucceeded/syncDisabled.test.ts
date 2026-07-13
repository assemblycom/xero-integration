import { buildPaymentSucceededWebhook } from '@test/fixtures/paymentSucceeded.webhook'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — payment.succeeded sync disabled', () => {
  const apis = setupWebhookTest()

  it('acks and does nothing when isSyncEnabled is false', async () => {
    // addAbsorbedFees is on, so only the controller-level isSyncEnabled gate stops it.
    await seedConnectedPortal({ settings: { isSyncEnabled: false, addAbsorbedFees: true } })
    await seedSyncedInvoice({ status: 'success' })

    const res = await postWebhook(buildPaymentSucceededWebhook())
    expect(res.status).toBe(200)

    expect(apis.xero.createBankTransaction).not.toHaveBeenCalled()
    expect(await db.select().from(syncedPayments)).toHaveLength(0)
    expect(await db.select().from(syncLogs)).toHaveLength(0)
  })
})
