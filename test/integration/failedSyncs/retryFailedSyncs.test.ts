import { MAX_RETRY_ATTEMPTS } from '@failed-syncs/lib/constants'
import RetryFailedSyncsService from '@failed-syncs/lib/RetryFailedSyncs.service'
import { ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_PORTAL, TEST_PRODUCT } from '@test/helpers/constants'
import { createMockCopilotAPI } from '@test/helpers/mocks'
import { seedConnectedPortal } from '@test/helpers/seed'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import type { InferInsertModel } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'

type FailedSyncOverrides = Partial<InferInsertModel<typeof failedSyncs>>

// product.created/updated require a description, so payloads carry one.
const insertFailedSync = (overrides: FailedSyncOverrides = {}) =>
  db.insert(failedSyncs).values({
    portalId: TEST_PORTAL.id,
    tenantId: TEST_PORTAL.tenantId,
    type: ValidWebhookEvent.ProductCreated,
    token: 'stored-token',
    resourceId: TEST_PRODUCT.id,
    attempts: 0,
    payload: { id: TEST_PRODUCT.id, name: 'Product 1', description: 'Desc' },
    ...overrides,
  })

const remaining = () =>
  db.select().from(failedSyncs).where(eq(failedSyncs.portalId, TEST_PORTAL.id))

describe('RetryFailedSyncsService#retryFailedSyncs', () => {
  const apis = setupWebhookTest(() => ({
    // Legacy price.created looks the product up here; give it a description.
    copilot: createMockCopilotAPI({
      getProductsMapById: vi.fn().mockResolvedValue({
        [TEST_PRODUCT.id]: { id: TEST_PRODUCT.id, name: 'Product 1', description: 'Desc' },
      }),
    }),
  }))

  it('runs a successful retry and deletes the record', async () => {
    await seedConnectedPortal()
    await insertFailedSync()

    await new RetryFailedSyncsService().retryFailedSyncs()

    expect(await remaining()).toHaveLength(0)
    expect(apis.xero.createItems).toHaveBeenCalled()
  })

  it('keeps the failing record and still processes the others', async () => {
    await seedConnectedPortal()
    await insertFailedSync({
      resourceId: 'product-a',
      payload: { id: 'product-a', name: 'A', description: 'Desc' },
    })
    await insertFailedSync({
      resourceId: 'product-b',
      payload: { id: 'product-b', name: 'B', description: 'Desc' },
    })
    apis.xero.createItems.mockRejectedValueOnce(new Error('boom'))

    await new RetryFailedSyncsService().retryFailedSyncs()

    // One record failed and is kept; the other succeeded and was deleted.
    expect(await remaining()).toHaveLength(1)
  })

  it('resolves a legacy price.created to product.created', async () => {
    await seedConnectedPortal()
    await insertFailedSync({
      type: ValidWebhookEvent.PriceCreated,
      resourceId: 'price-1',
      payload: { id: 'price-1', productId: TEST_PRODUCT.id },
    })

    await new RetryFailedSyncsService().retryFailedSyncs()

    expect(await remaining()).toHaveLength(0)
    expect(apis.xero.createItems).toHaveBeenCalled()
  })

  it('drops a legacy price.created whose product no longer exists', async () => {
    await seedConnectedPortal()
    await insertFailedSync({
      type: ValidWebhookEvent.PriceCreated,
      resourceId: 'price-2',
      payload: { id: 'price-2', productId: 'ghost-product' },
    })

    await new RetryFailedSyncsService().retryFailedSyncs()

    expect(await remaining()).toHaveLength(0)
    expect(apis.xero.createItems).not.toHaveBeenCalled()
  })

  it('excludes records past the retry cap', async () => {
    await seedConnectedPortal()
    await insertFailedSync({ attempts: MAX_RETRY_ATTEMPTS + 1 })

    await new RetryFailedSyncsService().retryFailedSyncs()

    expect(await remaining()).toHaveLength(1)
    expect(apis.xero.createItems).not.toHaveBeenCalled()
  })
})
