import FailedSyncsService from '@failed-syncs/lib/FailedSyncs.service'
import { ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_PORTAL, TEST_TOKENS } from '@test/helpers/constants'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import User from '@/lib/copilot/models/User.model'

describe('FailedSyncsService', () => {
  setupWebhookTest()

  const service = async () => new FailedSyncsService(await User.authenticate(TEST_TOKENS.webhook))
  const payload = { id: 'resource-1', name: 'Product 1' }

  const rows = () => db.select().from(failedSyncs).where(eq(failedSyncs.portalId, TEST_PORTAL.id))

  it('inserts a new failed sync record on first failure', async () => {
    await (await service()).addFailedSyncRecord(
      TEST_PORTAL.tenantId,
      ValidWebhookEvent.ProductCreated,
      payload,
    )

    const [row] = await rows()
    expect(row.resourceId).toBe('resource-1')
    expect(row.type).toBe(ValidWebhookEvent.ProductCreated)
    expect(row.attempts).toBe(0)
    expect(row.token).toBe(TEST_TOKENS.webhook)
    expect(row.payload).toEqual(payload)
  })

  it('increments attempts when the same resource fails again', async () => {
    const svc = await service()
    await svc.addFailedSyncRecord(TEST_PORTAL.tenantId, ValidWebhookEvent.ProductCreated, payload)
    await svc.addFailedSyncRecord(TEST_PORTAL.tenantId, ValidWebhookEvent.ProductCreated, payload)

    const all = await rows()
    expect(all).toHaveLength(1)
    expect(all[0].attempts).toBe(1)
  })

  it('deletes a failed sync record', async () => {
    const svc = await service()
    await svc.addFailedSyncRecord(TEST_PORTAL.tenantId, ValidWebhookEvent.ProductCreated, payload)

    await svc.deleteFailedSync(TEST_PORTAL.id, TEST_PORTAL.tenantId, 'resource-1')

    expect(await rows()).toHaveLength(0)
  })

  it('does not delete a record belonging to a different tenant', async () => {
    const svc = await service()
    await svc.addFailedSyncRecord(TEST_PORTAL.tenantId, ValidWebhookEvent.ProductCreated, payload)

    const otherTenantId = '99999999-9999-4999-8999-999999999999'
    await svc.deleteFailedSync(TEST_PORTAL.id, otherTenantId, 'resource-1')

    expect(await rows()).toHaveLength(1)
  })
})
