import { ValidWebhookEvent } from '@invoice-sync/types'
import { buildDeletedInvoiceWebhook } from '@test/fixtures/deletedInvoice.webhook'
import { TEST_CLIENT, TEST_INVOICE } from '@test/helpers/constants'
import { enableDeleteSyncForTest } from '@test/helpers/deleteSyncFlag'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedInvoice, seedSyncLog } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.deleted xero failure', () => {
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      deleteInvoice: vi.fn().mockRejectedValue(new Error('Xero 500: delete rejected')),
    }),
  }))
  enableDeleteSyncForTest()

  it('records failure in sync_logs and failed_syncs, and returns 500', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    await seedSyncLog()

    const res = await postWebhook(buildDeletedInvoiceWebhook())
    expect(res.status).toBe(500)

    // Voided first, then the delete throws.
    expect(apis.xero.voidInvoice).toHaveBeenCalledTimes(1)
    expect(apis.xero.deleteInvoice).toHaveBeenCalledTimes(1)

    // A failed deleted log carrying the created metadata...
    const deletedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.DELETED))
    expect(deletedLogs).toHaveLength(1)
    expect(deletedLogs[0]).toMatchObject({
      status: SyncStatus.FAILED,
      invoiceNumber: TEST_INVOICE.number,
      customerName: `${TEST_CLIENT.givenName} ${TEST_CLIENT.familyName}`,
    })

    // ...and a failed_syncs row for retry.
    const failed = await db.select().from(failedSyncs)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      type: ValidWebhookEvent.InvoiceDeleted,
      resourceId: TEST_INVOICE.id,
    })
  })
})
