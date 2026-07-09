import { buildVoidedInvoiceWebhook } from '@test/fixtures/voidedInvoice.webhook'
import { seedConnectedPortal, seedSyncedInvoice } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { SyncEventType, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — invoice.voided sync disabled', () => {
  const apis = setupWebhookTest()

  it('short-circuits at the controller when sync is disabled', async () => {
    await seedConnectedPortal({ settings: { isSyncEnabled: false } })
    await seedSyncedInvoice({ status: 'success' })

    const res = await postWebhook(buildVoidedInvoiceWebhook())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ message: 'Sync is disabled for this workspace' })

    // Handler never runs: no void call and no voided log.
    expect(apis.xero.voidInvoice).not.toHaveBeenCalled()
    const voidedLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.eventType, SyncEventType.VOIDED))
    expect(voidedLogs).toHaveLength(0)
  })
})
