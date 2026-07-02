import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'

describe('POST /api/webhook — invoice.created draft', () => {
  const apis = setupWebhookTest()

  it('acks a draft invoice without syncing or recording a failure', async () => {
    await seedConnectedPortal()

    const res = await postWebhook(buildInvoiceCreatedWebhook({ status: 'draft' }))
    expect(res.status).toBe(200)

    expect(apis.xero.createInvoice).not.toHaveBeenCalled()
    expect(await db.select().from(syncedInvoices)).toHaveLength(0)
    // Draft is ignored via APIError(OK) — not a failure.
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
