import { buildVoidedInvoiceWebhook } from '@test/fixtures/voidedInvoice.webhook'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.voided without a prior created log', () => {
  const apis = setupWebhookTest()

  it('voids successfully even when no invoice.created log exists', async () => {
    await seedConnectedPortal()
    await seedSyncedInvoice({ status: 'success' })
    // No seedSyncLog(): the invoice.created log is absent, so the voided log
    // must default its NOT-NULL entityType rather than inherit it.

    const res = await postWebhook(buildVoidedInvoiceWebhook())
    expect(res.status).toBe(200)

    expect(apis.xero.voidInvoice).toHaveBeenCalledTimes(1)

    // The voided success log still writes, defaulting entityType to invoice.
    const voidedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.VOIDED))
    expect(voidedLogs).toHaveLength(1)
    expect(voidedLogs[0]).toMatchObject({
      status: SyncStatus.SUCCESS,
      entityType: SyncEntityType.INVOICE,
    })

    // The void succeeded, so nothing is recorded for retry.
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
