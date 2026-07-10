import { buildDeletedInvoiceWebhook } from '@test/fixtures/deletedInvoice.webhook'
import { TEST_INVOICE, TEST_PORTAL, TEST_XERO_INVOICE } from '@test/helpers/constants'
import { enableDeleteSyncForTest } from '@test/helpers/deleteSyncFlag'
import { seedConnectedPortal, seedSyncedInvoice, seedSyncLog } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
import { SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.deleted', () => {
  const apis = setupWebhookTest()
  enableDeleteSyncForTest()

  it('voids the invoice then deletes it in Xero, logging both events', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    await seedSyncLog()

    // The default getInvoiceById returns a non-VOIDED invoice, so this drives
    // the "void first, then delete" branch.
    const res = await postWebhook(buildDeletedInvoiceWebhook())
    expect(res.status).toBe(200)

    // Not-yet-voided invoice is voided first, then deleted.
    expect(apis.xero.voidInvoice).toHaveBeenCalledTimes(1)
    expect(apis.xero.deleteInvoice).toHaveBeenCalledTimes(1)
    const [tenantId, xeroInvoiceId] = apis.xero.deleteInvoice.mock.calls[0]
    expect(tenantId).toBe(TEST_PORTAL.tenantId)
    expect(xeroInvoiceId).toBe(TEST_XERO_INVOICE.id)

    // Invoice row is untouched by the delete.
    const invoices = await db.select().from(syncedInvoices)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({ copilotInvoiceId: TEST_INVOICE.id, status: 'success' })

    // Both a voided (from the internal void) and a deleted success log are written.
    const voidedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.VOIDED))
    expect(voidedLogs).toHaveLength(1)
    const deletedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.DELETED))
    expect(deletedLogs).toHaveLength(1)
    expect(deletedLogs[0]).toMatchObject({
      status: SyncStatus.SUCCESS,
      invoiceNumber: TEST_INVOICE.number,
    })

    // No failure recorded on the happy path.
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
