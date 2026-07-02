import { ValidWebhookEvent } from '@invoice-sync/types'
import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import { TEST_INVOICE } from '@test/helpers/constants'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.created xero failure', () => {
  // Override createInvoice to throw; a fresh factory per test keeps the mock isolated.
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      createInvoice: vi.fn().mockRejectedValue(new Error('Xero 500: invoice rejected')),
    }),
  }))

  it('records failure in synced_invoices, sync_logs and failed_syncs, and returns 500', async () => {
    await seedConnectedPortal()

    const res = await postWebhook(buildInvoiceCreatedWebhook())
    expect(res.status).toBe(500)

    expect(apis.xero.createInvoice).toHaveBeenCalledTimes(1)

    // Invoice record marked failed, not mapped to a Xero id.
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({ copilotInvoiceId: TEST_INVOICE.id, status: 'failed' })
    expect(invoices[0].xeroInvoiceId).toBeNull()

    // A failed sync log is written for the invoice.
    const logs = await db.select().from(syncLogs).where(eq(syncLogs.copilotId, TEST_INVOICE.id))
    expect(logs).toHaveLength(1)
    expect(logs[0].status).toBe(SyncStatus.FAILED)

    // A failed_syncs row is recorded for retry.
    const failed = await db.select().from(failedSyncs)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      type: ValidWebhookEvent.InvoiceCreated,
      resourceId: TEST_INVOICE.id,
    })
  })
})
