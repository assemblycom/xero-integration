import { ValidWebhookEvent } from '@invoice-sync/types'
import { buildPaidInvoiceWebhook } from '@test/fixtures/paidInvoice.webhook'
import { TEST_INVOICE } from '@test/helpers/constants'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEventType, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.paid Xero invoice not found', () => {
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      getInvoiceById: vi.fn().mockResolvedValue(undefined),
    }),
  }))

  it('records failed_syncs and returns 404 when the Xero invoice is missing', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })

    const res = await postWebhook(buildPaidInvoiceWebhook())
    expect(res.status).toBe(404)

    // Not-found short-circuits before any payment work.
    expect(apis.xero.markInvoicePaid).not.toHaveBeenCalled()
    expect(await db.select().from(syncedPayments)).toHaveLength(0)

    // The invoice row is left unchanged.
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({ copilotInvoiceId: TEST_INVOICE.id, status: 'success' })

    // The NOT_FOUND error carries no failedSyncLogPayload, so no sync log...
    const paidLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.PAID))
    expect(paidLogs).toHaveLength(0)

    // ...but a failed_syncs row is still recorded for retry.
    const failed = await db.select().from(failedSyncs)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      type: ValidWebhookEvent.InvoicePaid,
      resourceId: TEST_INVOICE.id,
    })
  })
})
