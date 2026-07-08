import { ValidWebhookEvent } from '@invoice-sync/types'
import { buildPaidInvoiceWebhook } from '@test/fixtures/paidInvoice.webhook'
import { TEST_CLIENT, TEST_INVOICE } from '@test/helpers/constants'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedInvoice, seedSyncLog } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.paid xero failure', () => {
  // Override markInvoicePaid to throw; a fresh factory per test keeps it isolated.
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      markInvoicePaid: vi.fn().mockRejectedValue(new Error('Xero 500: payment rejected')),
    }),
  }))

  it('records failure in sync_logs and failed_syncs, and returns 500', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    // A payment failure normally follows a successful invoice.created, whose log
    // supplies the invoice metadata the failed paid log carries forward.
    await seedSyncLog()

    const res = await postWebhook(buildPaidInvoiceWebhook())
    expect(res.status).toBe(500)

    expect(apis.xero.markInvoicePaid).toHaveBeenCalledTimes(1)

    // No payment row is written on failure.
    expect(await db.select().from(syncedPayments)).toHaveLength(0)

    // The invoice row is untouched by the failed payment (stays as-created).
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({ copilotInvoiceId: TEST_INVOICE.id, status: 'success' })

    // A failed paid sync log is written, carrying the invoice.created metadata
    // forward via the failedSyncLogPayload spread.
    const paidLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.PAID))
    expect(paidLogs).toHaveLength(1)
    expect(paidLogs[0]).toMatchObject({
      status: SyncStatus.FAILED,
      invoiceNumber: TEST_INVOICE.number,
      customerName: `${TEST_CLIENT.givenName} ${TEST_CLIENT.familyName}`,
      customerEmail: TEST_CLIENT.email,
    })

    // A failed_syncs row is recorded for retry.
    const failed = await db.select().from(failedSyncs)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      type: ValidWebhookEvent.InvoicePaid,
      resourceId: TEST_INVOICE.id,
    })
  })
})
