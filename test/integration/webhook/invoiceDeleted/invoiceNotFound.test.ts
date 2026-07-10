import { ValidWebhookEvent } from '@invoice-sync/types'
import { buildDeletedInvoiceWebhook } from '@test/fixtures/deletedInvoice.webhook'
import { TEST_INVOICE } from '@test/helpers/constants'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedInvoice, seedSyncLog } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.deleted Xero invoice not found', () => {
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      getInvoiceById: vi.fn().mockResolvedValue(undefined),
    }),
  }))

  it('records failed_syncs and returns 500 when the Xero invoice is missing', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    await seedSyncLog()

    const res = await postWebhook(buildDeletedInvoiceWebhook())
    // Validation sits inside the try, so not-found is re-wrapped as 500 (not 404).
    expect(res.status).toBe(500)

    expect(apis.xero.voidInvoice).not.toHaveBeenCalled()
    expect(apis.xero.deleteInvoice).not.toHaveBeenCalled()

    // A failed deleted log is written (prevSyncLog supplies entityType)...
    const deletedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.DELETED))
    expect(deletedLogs).toHaveLength(1)
    expect(deletedLogs[0]).toMatchObject({ status: SyncStatus.FAILED })

    // ...and a failed_syncs row recorded for retry.
    const failed = await db.select().from(failedSyncs)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      type: ValidWebhookEvent.InvoiceDeleted,
      resourceId: TEST_INVOICE.id,
    })
  })
})
