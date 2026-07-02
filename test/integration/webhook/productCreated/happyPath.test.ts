import productCreatedPayload from '@test/fixtures/productCreated.webhook'
import { TEST_PORTAL, TEST_PRODUCT, TEST_XERO_ITEM } from '@test/helpers/constants'
import { setupProductCreatedTest } from '@test/helpers/productCreatedTestSetup'
import { seedConnectedPortal } from '@test/helpers/seed'
import { postWebhook } from '@test/helpers/webhook'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'

describe('POST /api/webhook — product.created', () => {
  const apis = setupProductCreatedTest()

  it('creates a Xero item, maps it in synced_items, and logs the sync as successful', async () => {
    await seedConnectedPortal()

    const res = await postWebhook(productCreatedPayload)
    expect(res.status).toBe(200)

    // Xero item created once for the connected tenant with the product details.
    expect(apis.xero.createItems).toHaveBeenCalledTimes(1)
    const [tenantId, itemsCreated] = apis.xero.createItems.mock.calls[0]
    expect(tenantId).toBe(TEST_PORTAL.tenantId)
    expect(itemsCreated).toHaveLength(1)
    expect(itemsCreated[0]).toMatchObject({
      name: 'Test Product',
      description: 'A great test product',
      isPurchased: false,
    })

    // Product mapped to the Xero item.
    const items = await db.select().from(syncedItems)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      productId: TEST_PRODUCT.id,
      itemId: TEST_XERO_ITEM.id,
    })

    // Success sync log written for the product.
    const logs = await db.select().from(syncLogs).where(eq(syncLogs.copilotId, TEST_PRODUCT.id))
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      portalId: TEST_PORTAL.id,
      tenantId: TEST_PORTAL.tenantId,
      entityType: SyncEntityType.PRODUCT,
      eventType: SyncEventType.CREATED,
      status: SyncStatus.SUCCESS,
      xeroId: TEST_XERO_ITEM.id,
      productName: 'Test Product',
      xeroItemName: 'Test Product',
    })

    // No failure recorded on the happy path.
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
