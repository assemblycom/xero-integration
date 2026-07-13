import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import { buildPaymentSucceededWebhook } from '@test/fixtures/paymentSucceeded.webhook'
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
import { SyncEntityType, SyncEventType, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — payment.succeeded missing Xero invoice', () => {
  // No xeroInvoiceId, so the service recreates the Xero invoice before the expense.
  const apis = setupWebhookTest(() => ({
    copilot: createMockCopilotAPI({
      getInvoice: vi.fn().mockResolvedValue(buildInvoiceCreatedWebhook().data),
    }),
  }))

  it('creates the missing Xero invoice, then records the expense', async () => {
    await seedConnectedPortal({ settings: { addAbsorbedFees: true } })
    await seedSyncedInvoice({ status: 'pending', xeroInvoiceId: null })

    const res = await postWebhook(buildPaymentSucceededWebhook())
    expect(res.status).toBe(200)

    expect(apis.copilot.getInvoice).toHaveBeenCalledTimes(1)
    expect(apis.xero.createInvoice).toHaveBeenCalledTimes(1)
    expect(apis.xero.createBankTransaction).toHaveBeenCalledTimes(1)

    // Invoice row now mapped to Xero and marked success.
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({
      copilotInvoiceId: TEST_INVOICE.id,
      xeroInvoiceId: TEST_XERO_INVOICE.id,
      status: 'success',
    })

    // Expense recorded and an expense sync log written.
    expect(await db.select().from(syncedPayments)).toHaveLength(1)
    const expenseLogs = await db
      .select()
      .from(syncLogs)
      .where(
        and(
          eq(syncLogs.entityType, SyncEntityType.EXPENSE),
          eq(syncLogs.eventType, SyncEventType.CREATED),
        ),
      )
    expect(expenseLogs).toHaveLength(1)
  })
})
