import { buildDeletedInvoiceWebhook } from '@test/fixtures/deletedInvoice.webhook'
import { seedConnectedPortal, seedSyncedInvoice, seedSyncLog } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { SyncEventType, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.deleted delete sync disabled', () => {
  const apis = setupWebhookTest()
  // FLAG_ENABLE_DELETE_SYNC defaults to false — no enableDeleteSyncForTest().

  it('voids the invoice but skips the delete when the flag is off', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    await seedSyncLog()

    const res = await postWebhook(buildDeletedInvoiceWebhook())
    expect(res.status).toBe(200)

    // Voided, but the flag gates the actual delete.
    expect(apis.xero.voidInvoice).toHaveBeenCalledTimes(1)
    expect(apis.xero.deleteInvoice).not.toHaveBeenCalled()

    // No deleted log written.
    const deletedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.DELETED))
    expect(deletedLogs).toHaveLength(0)
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
