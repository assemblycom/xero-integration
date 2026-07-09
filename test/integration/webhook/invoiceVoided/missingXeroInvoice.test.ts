import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import { buildVoidedInvoiceWebhook } from '@test/fixtures/voidedInvoice.webhook'
import { TEST_INVOICE, TEST_XERO_INVOICE } from '@test/helpers/constants'
import { createMockCopilotAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.voided missing Xero invoice', () => {
  // The synced row has no xeroInvoiceId, so the service re-fetches the Copilot
  // invoice and creates it in Xero before voiding.
  const apis = setupWebhookTest(() => ({
    copilot: createMockCopilotAPI({
      getInvoice: vi.fn().mockResolvedValue(buildInvoiceCreatedWebhook().data),
    }),
  }))

  it('creates the missing Xero invoice, then voids it', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'pending', xeroInvoiceId: null })

    const res = await postWebhook(buildVoidedInvoiceWebhook())
    expect(res.status).toBe(200)

    // Missing invoice is created first, then voided.
    expect(apis.copilot.getInvoice).toHaveBeenCalledTimes(1)
    expect(apis.xero.createInvoice).toHaveBeenCalledTimes(1)
    expect(apis.xero.voidInvoice).toHaveBeenCalledTimes(1)

    // Invoice row now mapped to Xero and marked success.
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({
      copilotInvoiceId: TEST_INVOICE.id,
      xeroInvoiceId: TEST_XERO_INVOICE.id,
      status: 'success',
    })

    // A voided success sync log written.
    const voidedLogs = await db
      .select()
      .from(syncLogs)
      .where(
        and(
          eq(syncLogs.eventType, SyncEventType.VOIDED),
          eq(syncLogs.status, SyncStatus.SUCCESS),
          eq(syncLogs.entityType, SyncEntityType.INVOICE),
        ),
      )
    expect(voidedLogs).toHaveLength(1)
  })
})
