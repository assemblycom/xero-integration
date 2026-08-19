import RetryFailedSyncsService from '@failed-syncs/lib/RetryFailedSyncs.service'
import { ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_PORTAL } from '@test/helpers/constants'
import { seedConnectedPortal } from '@test/helpers/seed'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { describe, expect, it, vi } from 'vitest'
import env from '@/config/server.env'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { CopilotAPI } from '@/lib/copilot/CopilotAPI'
import User from '@/lib/copilot/models/User.model'
import { encodePayload } from '@/utils/crypto'

// A second portal to prove per-portal isolation against the seeded TEST_PORTAL.
const PORTAL_A = TEST_PORTAL
const PORTAL_B = {
  id: 'test-portal-00000002',
  tenantId: '77777777-7777-4777-8777-777777777777',
  internalUserId: '88888888-8888-4888-8888-888888888888',
}

describe('cross-portal isolation', () => {
  const apis = setupWebhookTest()

  it('builds each portal a CopilotAPI scoped to its own token, never a shared workspaceId', async () => {
    const tokenA = encodePayload(env.COPILOT_API_KEY, { workspaceId: PORTAL_A.id })
    const tokenB = encodePayload(env.COPILOT_API_KEY, { workspaceId: PORTAL_B.id })

    const userA = await User.authenticate(tokenA)
    const userB = await User.authenticate(tokenB)

    // Each user's portal comes from its own token.
    expect(userA.portalId).toBe(PORTAL_A.id)
    expect(userB.portalId).toBe(PORTAL_B.id)
    expect(userA.portalId).not.toBe(userB.portalId)

    // The Copilot client for each was constructed with that portal's workspaceId.
    const workspaceIds = vi.mocked(CopilotAPI).mock.calls.map((call) => call[0])
    expect(workspaceIds).toContain(PORTAL_A.id)
    expect(workspaceIds).toContain(PORTAL_B.id)
  })

  it('retries each portal against its own Xero tenant, never another portal’s', async () => {
    // Two connected portals, each with sync enabled.
    await seedConnectedPortal()
    await seedConnectedPortal({
      connection: {
        portalId: PORTAL_B.id,
        tenantId: PORTAL_B.tenantId,
        initiatedBy: PORTAL_B.internalUserId,
      },
      settings: { portalId: PORTAL_B.id, tenantId: PORTAL_B.tenantId },
    })

    const productA = { id: 'product-a', name: 'Product A', description: 'Belongs to portal A' }
    const productB = { id: 'product-b', name: 'Product B', description: 'Belongs to portal B' }

    // One product.created failed sync per portal.
    await db.insert(failedSyncs).values([
      {
        portalId: PORTAL_A.id,
        tenantId: PORTAL_A.tenantId,
        type: ValidWebhookEvent.ProductCreated,
        token: encodePayload(env.COPILOT_API_KEY, { workspaceId: PORTAL_A.id }),
        resourceId: productA.id,
        attempts: 0,
        payload: productA,
      },
      {
        portalId: PORTAL_B.id,
        tenantId: PORTAL_B.tenantId,
        type: ValidWebhookEvent.ProductCreated,
        token: encodePayload(env.COPILOT_API_KEY, { workspaceId: PORTAL_B.id }),
        resourceId: productB.id,
        attempts: 0,
        payload: productB,
      },
    ])

    await new RetryFailedSyncsService().retryFailedSyncs()

    // Each portal's Xero item was created against that portal's tenant.
    const createCalls = apis.xero.createItems.mock.calls
    const callA = createCalls.find(([, items]) => items[0]?.name === productA.name)
    const callB = createCalls.find(([, items]) => items[0]?.name === productB.name)

    expect(callA?.[0]).toBe(PORTAL_A.tenantId)
    expect(callB?.[0]).toBe(PORTAL_B.tenantId)
    // The core guard: no portal's product reached the other's Xero tenant.
    expect(callA?.[0]).not.toBe(PORTAL_B.tenantId)
    expect(callB?.[0]).not.toBe(PORTAL_A.tenantId)

    // And the DB mapping landed under the right portal + tenant.
    const items = await db.select().from(syncedItems)
    expect(items.find((row) => row.portalId === PORTAL_A.id)?.tenantId).toBe(PORTAL_A.tenantId)
    expect(items.find((row) => row.portalId === PORTAL_B.id)?.tenantId).toBe(PORTAL_B.tenantId)

    // Both dispatched successfully, so no failed_syncs remain.
    expect(await db.select().from(failedSyncs)).toHaveLength(0)
  })
})
