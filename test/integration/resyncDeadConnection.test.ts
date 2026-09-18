import RetryFailedSyncsService from '@failed-syncs/lib/RetryFailedSyncs.service'
import { ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_PORTAL } from '@test/helpers/constants'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedXeroConnection } from '@test/helpers/seed'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { TokenSet } from 'xero-node'
import env from '@/config/server.env'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { encodePayload } from '@/utils/crypto'

// Healthy portal (valid token) vs a portal whose Xero connection is dead: its
// access token is expired and the refresh fails (Xero 400 invalid_grant). The
// dead connection is already inactive (status false), matching the steady state
// after the first failure already flipped it and notified the owner once.
const HEALTHY = TEST_PORTAL
const DEAD = {
  id: 'test-portal-00000009',
  tenantId: '99999999-9999-4999-8999-999999999999',
  internalUserId: 'aaaaaaaa-9999-4999-8999-aaaaaaaaaaaa',
}

const tokenFor = (portalId: string) => encodePayload(env.COPILOT_API_KEY, { workspaceId: portalId })

describe('resync with a dead Xero connection', () => {
  const apis = setupWebhookWithFailingRefresh()

  it('authorizes a dead portal once per run, keeps its records, and still syncs healthy portals', async () => {
    await seedConnectedPortal() // HEALTHY: active connection + sync-enabled settings

    // DEAD: inactive connection with an expired access token but a present refresh token,
    // so authorize() takes the refresh path (which the mock rejects).
    await seedXeroConnection({
      portalId: DEAD.id,
      tenantId: DEAD.tenantId,
      initiatedBy: DEAD.internalUserId,
      status: false,
      tokenSet: {
        access_token: 'expired-access-token',
        refresh_token: 'dead-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 3600,
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'accounting.transactions offline_access',
      } as unknown as TokenSet,
    })

    const healthyProduct = { id: 'product-healthy', name: 'Healthy Product', description: 'A' }

    await db.insert(failedSyncs).values([
      {
        portalId: HEALTHY.id,
        tenantId: HEALTHY.tenantId,
        type: ValidWebhookEvent.ProductCreated,
        token: tokenFor(HEALTHY.id),
        resourceId: healthyProduct.id,
        attempts: 0,
        payload: healthyProduct,
      },
      // Two records for the dead portal — proves we authorize it only once, not per record.
      {
        portalId: DEAD.id,
        tenantId: DEAD.tenantId,
        type: ValidWebhookEvent.ProductCreated,
        token: tokenFor(DEAD.id),
        resourceId: 'product-dead-1',
        attempts: 0,
        payload: { id: 'product-dead-1', name: 'Dead 1' },
      },
      {
        portalId: DEAD.id,
        tenantId: DEAD.tenantId,
        type: ValidWebhookEvent.ProductCreated,
        token: tokenFor(DEAD.id),
        resourceId: 'product-dead-2',
        attempts: 0,
        payload: { id: 'product-dead-2', name: 'Dead 2' },
      },
    ])

    await new RetryFailedSyncsService().retryFailedSyncs()

    // The dead portal must not block other portals: the healthy portal still synced to
    // its own tenant and its record was cleared.
    const createCalls = apis.xero.createItems.mock.calls
    expect(createCalls.find(([tenantId]) => tenantId === HEALTHY.tenantId)).toBeDefined()
    expect(
      await db.select().from(failedSyncs).where(eq(failedSyncs.portalId, HEALTHY.id)),
    ).toHaveLength(0)

    // The dead portal's records are preserved (not dropped, not aged out) for a later
    // run once the owner reconnects — attempts untouched so the retry cap stays intact.
    const deadRows = await db.select().from(failedSyncs).where(eq(failedSyncs.portalId, DEAD.id))
    expect(deadRows).toHaveLength(2)
    expect(deadRows.every((row) => row.attempts === 0)).toBe(true)

    // The dead portal is authorized exactly once, even with two records queued.
    expect(apis.xero.refreshWithRefreshToken).toHaveBeenCalledTimes(1)
  })
})

// Local setup so the refresh call rejects with a Xero-style failure for this suite.
function setupWebhookWithFailingRefresh() {
  return setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      refreshWithRefreshToken: vi.fn().mockRejectedValue(new Error('invalid_grant')),
    }),
  }))
}
