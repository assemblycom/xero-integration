import { buildPaymentSucceededWebhook } from '@test/fixtures/paymentSucceeded.webhook'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — payment.succeeded unsupported region', () => {
  const apis = setupWebhookTest()

  it('acks and skips when the Xero region is unsupported', async () => {
    // GB is unsupported, so getRegionConfig returns null and the handler skips.
    await seedConnectedPortal({ settings: { countryCode: 'GB', addAbsorbedFees: true } })
    await seedSyncedInvoice({ status: 'success' })

    const res = await postWebhook(buildPaymentSucceededWebhook())
    expect(res.status).toBe(200)

    expect(apis.xero.createBankTransaction).not.toHaveBeenCalled()
    expect(await db.select().from(syncedPayments)).toHaveLength(0)
    expect(await db.select().from(syncLogs)).toHaveLength(0)
  })
})
