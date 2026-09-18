import { MAX_RETRY_ATTEMPTS } from '@failed-syncs/lib/constants'
import RetryFailedSyncsService from '@failed-syncs/lib/RetryFailedSyncs.service'
import { ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_PORTAL, TEST_PRODUCT, TEST_XERO_ITEM } from '@test/helpers/constants'
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
    // Fail only product-a's sync, regardless of processing order.
    apis.xero.createItems.mockImplementation(
      (_tenantId: string, items: { code: string; name: string; description?: string }[]) => {
        if (items.some((item) => item.name === 'A')) throw new Error('boom')
        return items.map((item) => ({ itemID: TEST_XERO_ITEM.id, ...item }))
      },
    )

    await new RetryFailedSyncsService().retryFailedSyncs()

    // product-a failed and is kept; product-b succeeded and was deleted.
    const rows = await remaining()
    expect(rows).toHaveLength(1)
    expect(rows[0].resourceId).toBe('product-a')
    expect(apis.xero.createItems).toHaveBeenCalledTimes(2)
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
