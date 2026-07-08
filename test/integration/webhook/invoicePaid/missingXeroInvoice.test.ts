import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import { buildPaidInvoiceWebhook } from '@test/fixtures/paidInvoice.webhook'
import { TEST_INVOICE, TEST_XERO_INVOICE } from '@test/helpers/constants'
import { createMockCopilotAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { syncedPayments } from '@/db/schema/syncedPayments.schema'
import { SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.paid missing Xero invoice', () => {
  // The synced row has no xeroInvoiceId, so the service re-fetches the Copilot
  // invoice and creates it in Xero before paying.
  const apis = setupWebhookTest(() => ({
    copilot: createMockCopilotAPI({
      getInvoice: vi.fn().mockResolvedValue(buildInvoiceCreatedWebhook().data),
    }),
  }))

  it('creates the missing Xero invoice, then marks it paid', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'pending', xeroInvoiceId: null })

    const res = await postWebhook(buildPaidInvoiceWebhook())
    expect(res.status).toBe(200)

    // Missing invoice is created first, then paid. The sales-code passed to
    // markInvoicePaid is asserted in happyPath; here we only assert the ordering.
    expect(apis.copilot.getInvoice).toHaveBeenCalledTimes(1)
    expect(apis.xero.createInvoice).toHaveBeenCalledTimes(1)
    expect(apis.xero.markInvoicePaid).toHaveBeenCalledTimes(1)

    // Invoice row now mapped to Xero and marked success.
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({
      copilotInvoiceId: TEST_INVOICE.id,
      xeroInvoiceId: TEST_XERO_INVOICE.id,
      status: 'success',
    })

    // Payment recorded and a paid sync log written.
    expect(await db.select().from(syncedPayments)).toHaveLength(1)
    const paidLogs = await db
      .select()
      .from(syncLogs)
      .where(
        and(eq(syncLogs.eventType, SyncEventType.PAID), eq(syncLogs.status, SyncStatus.SUCCESS)),
      )
    expect(paidLogs).toHaveLength(1)
  })
})
