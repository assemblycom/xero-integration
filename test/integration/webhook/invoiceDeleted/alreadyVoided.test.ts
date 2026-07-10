import { buildDeletedInvoiceWebhook } from '@test/fixtures/deletedInvoice.webhook'
import { TEST_XERO_INVOICE } from '@test/helpers/constants'
import { enableDeleteSyncForTest } from '@test/helpers/deleteSyncFlag'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedInvoice, seedSyncLog } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.deleted already voided', () => {
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      getInvoiceById: vi.fn().mockResolvedValue({
        invoiceID: TEST_XERO_INVOICE.id,
        status: 'VOIDED',
      }),
    }),
  }))
  enableDeleteSyncForTest()

  it('skips voiding and deletes directly', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    await seedSyncLog()

    const res = await postWebhook(buildDeletedInvoiceWebhook())
    expect(res.status).toBe(200)

    // Already voided → skip the internal void, delete directly.
    expect(apis.xero.voidInvoice).not.toHaveBeenCalled()
    expect(apis.xero.deleteInvoice).toHaveBeenCalledTimes(1)

    // Only a deleted log; no voided log.
    const voidedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.VOIDED))
    expect(voidedLogs).toHaveLength(0)
    const deletedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.DELETED))
    expect(deletedLogs).toHaveLength(1)
    expect(deletedLogs[0]).toMatchObject({ status: SyncStatus.SUCCESS })
  })
})
