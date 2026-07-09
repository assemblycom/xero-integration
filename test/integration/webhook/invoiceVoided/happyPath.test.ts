import { buildVoidedInvoiceWebhook } from '@test/fixtures/voidedInvoice.webhook'
import { TEST_CLIENT, TEST_INVOICE, TEST_PORTAL, TEST_XERO_INVOICE } from '@test/helpers/constants'
import { seedConnectedPortal, seedSyncedInvoice, seedSyncLog } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.voided', () => {
  const apis = setupWebhookTest()

  it('voids the Xero invoice and logs the voided event', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    await seedSyncLog()

    const res = await postWebhook(buildVoidedInvoiceWebhook())
    expect(res.status).toBe(200)

    // Xero invoice fetched, then voided against the tenant.
    expect(apis.xero.getInvoiceById).toHaveBeenCalledTimes(1)
    expect(apis.xero.voidInvoice).toHaveBeenCalledTimes(1)
    const [tenantId, xeroInvoiceId] = apis.xero.voidInvoice.mock.calls[0]
    expect(tenantId).toBe(TEST_PORTAL.tenantId)
    expect(xeroInvoiceId).toBe(TEST_XERO_INVOICE.id)

    // Invoice row is untouched by the void.
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({ copilotInvoiceId: TEST_INVOICE.id, status: 'success' })

    // A voided success sync log written, carrying the created log's invoice fields.
    const voidedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.VOIDED))
    expect(voidedLogs).toHaveLength(1)
    expect(voidedLogs[0]).toMatchObject({
      status: SyncStatus.SUCCESS,
      invoiceNumber: TEST_INVOICE.number,
      customerName: `${TEST_CLIENT.givenName} ${TEST_CLIENT.familyName}`,
      entityType: SyncEntityType.INVOICE,
    })

    // No failure recorded on the happy path.
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
