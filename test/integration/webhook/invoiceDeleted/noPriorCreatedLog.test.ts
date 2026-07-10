import { buildDeletedInvoiceWebhook } from '@test/fixtures/deletedInvoice.webhook'
import { TEST_XERO_INVOICE } from '@test/helpers/constants'
import { enableDeleteSyncForTest } from '@test/helpers/deleteSyncFlag'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.deleted without a prior created log', () => {
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      getInvoiceById: vi.fn().mockResolvedValue({
        invoiceID: TEST_XERO_INVOICE.id,
        status: 'VOIDED',
      }),
    }),
  }))
  enableDeleteSyncForTest()

  it('deletes successfully even when no invoice.created log exists', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    // No seedSyncLog(): the deleted log must default its NOT-NULL entityType
    // rather than inherit it from a prior invoice.created log.

    const res = await postWebhook(buildDeletedInvoiceWebhook())
    expect(res.status).toBe(200)

    expect(apis.xero.voidInvoice).not.toHaveBeenCalled()
    expect(apis.xero.deleteInvoice).toHaveBeenCalledTimes(1)

    // The deleted success log still writes, defaulting entityType to invoice.
    const deletedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.DELETED))
    expect(deletedLogs).toHaveLength(1)
    expect(deletedLogs[0]).toMatchObject({
      status: SyncStatus.SUCCESS,
      entityType: SyncEntityType.INVOICE,
    })

    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
