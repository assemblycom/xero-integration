import { buildInvoiceCreatedWebhook } from '@test/fixtures/invoiceCreated.webhook'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'

describe('POST /api/webhook — invoice.created chargeAutomatically', () => {
  const apis = setupWebhookTest()

  it('skips a chargeAutomatically invoice without syncing', async () => {
    await seedConnectedPortal()

    const res = await postWebhook(
      buildInvoiceCreatedWebhook({ collectionMethod: 'chargeAutomatically' }),
    )
    expect(res.status).toBe(200)

    expect(apis.xero.createInvoice).not.toHaveBeenCalled()
    expect(await db.select().from(syncedInvoices)).toHaveLength(0)
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
