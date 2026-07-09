import { ValidWebhookEvent } from '@invoice-sync/types'
import { buildVoidedInvoiceWebhook } from '@test/fixtures/voidedInvoice.webhook'
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
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.voided xero failure', () => {
  // Override voidInvoice to throw; a fresh factory per test keeps it isolated.
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      voidInvoice: vi.fn().mockRejectedValue(new Error('Xero 500: void rejected')),
    }),
  }))

  it('records failure in sync_logs and failed_syncs, and returns 500', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    // A void failure normally follows a successful invoice.created, whose log
    // supplies the invoice metadata the failed voided log carries forward.
    await seedSyncLog()

    const res = await postWebhook(buildVoidedInvoiceWebhook())
    expect(res.status).toBe(500)

    expect(apis.xero.voidInvoice).toHaveBeenCalledTimes(1)

    // The invoice row is untouched by the failed void.
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({ copilotInvoiceId: TEST_INVOICE.id, status: 'success' })

    // A failed voided sync log is written, carrying the invoice.created metadata
    // forward via the failedSyncLogPayload spread.
    const voidedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.VOIDED))
    expect(voidedLogs).toHaveLength(1)
    expect(voidedLogs[0]).toMatchObject({
      status: SyncStatus.FAILED,
      invoiceNumber: TEST_INVOICE.number,
      customerName: `${TEST_CLIENT.givenName} ${TEST_CLIENT.familyName}`,
      customerEmail: TEST_CLIENT.email,
      errorMessage: 'Failed to void invoice',
      entityType: SyncEntityType.INVOICE,
    })

    // A failed_syncs row is recorded for retry.
    const failed = await db.select().from(failedSyncs)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      type: ValidWebhookEvent.InvoiceVoided,
      resourceId: TEST_INVOICE.id,
    })
  })
})
