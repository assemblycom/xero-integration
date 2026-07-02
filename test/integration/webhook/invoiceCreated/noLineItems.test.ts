import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import { TEST_INVOICE } from '@test/helpers/constants'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.created no line items', () => {
  const apis = setupWebhookTest()

  it('leaves the invoice pending without creating it in Xero', async () => {
    await seedConnectedPortal()

    const res = await postWebhook(buildInvoiceCreatedWebhook({ lineItems: [] }))
    expect(res.status).toBe(200)

    expect(apis.xero.createInvoice).not.toHaveBeenCalled()

    // A pending record is created; no sync log; not a failure.
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({ copilotInvoiceId: TEST_INVOICE.id, status: 'pending' })

    const logs = await db.select().from(syncLogs).where(eq(syncLogs.copilotId, TEST_INVOICE.id))
    expect(logs).toHaveLength(0)
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
