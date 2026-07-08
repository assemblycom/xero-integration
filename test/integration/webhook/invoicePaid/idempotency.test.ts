import { buildPaidInvoiceWebhook } from '@test/fixtures/paidInvoice.webhook'
import { seedConnectedPortal, seedSyncedInvoice, seedSyncedPayment } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEventType, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.paid idempotency', () => {
  const apis = setupWebhookTest()

  it('skips marking paid when the invoice already has a payment', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    await seedSyncedPayment()

    const res = await postWebhook(buildPaidInvoiceWebhook())
    expect(res.status).toBe(200)

    // Already-paid invoice short-circuits before creating another payment.
    // (getInvoiceById runs earlier, so it is not asserted here.)
    expect(apis.xero.markInvoicePaid).not.toHaveBeenCalled()

    // Still exactly one payment row, and no paid sync log was added.
    expect(await db.select().from(syncedPayments)).toHaveLength(1)
    const paidLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.PAID))
    expect(paidLogs).toHaveLength(0)
  })
})
