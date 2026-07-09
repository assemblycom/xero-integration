import { buildPaidInvoiceWebhook } from '@test/fixtures/paidInvoice.webhook'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.paid without a prior created log', () => {
  const apis = setupWebhookTest()

  it('pays successfully even when no invoice.created log exists', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    // No seedSyncLog(): the invoice.created log is absent, so the paid log must
    // default its NOT-NULL entityType rather than inherit it. Without the
    // default the log INSERT rolls back the transaction after markInvoicePaid
    // already ran, leaving a failed_syncs row that re-pays on retry.

    const res = await postWebhook(buildPaidInvoiceWebhook())
    expect(res.status).toBe(200)

    expect(apis.xero.markInvoicePaid).toHaveBeenCalledTimes(1)

    // The payment record is committed, so a retry short-circuits (no double pay).
    expect(await db.select().from(syncedPayments)).toHaveLength(1)

    // The paid success log still writes, defaulting entityType to invoice.
    const paidLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.PAID))
    expect(paidLogs).toHaveLength(1)
    expect(paidLogs[0]).toMatchObject({
      status: SyncStatus.SUCCESS,
      entityType: SyncEntityType.INVOICE,
    })

    // The payment succeeded, so nothing is recorded for retry.
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
