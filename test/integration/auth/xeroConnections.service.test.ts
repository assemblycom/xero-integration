import XeroConnectionsService from '@auth/lib/XeroConnections.service'
import { TEST_PORTAL, TEST_TOKENS } from '@test/helpers/constants'
import { seedXeroConnection } from '@test/helpers/seed'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { TokenSet } from 'xero-node'
import db from '@/db'
import { xeroConnections } from '@/db/schema/xeroConnections.schema'
import User from '@/lib/copilot/models/User.model'

const newTokenSet = {
  access_token: 'access-token-2',
  refresh_token: 'refresh-token-2',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'accounting.transactions offline_access',
} as unknown as TokenSet

describe('XeroConnectionsService', () => {
  setupWebhookTest()

  const service = async () =>
    new XeroConnectionsService(await User.authenticate(TEST_TOKENS.webhook))

  const rowForPortal = async () => {
    const [row] = await db
      .select()
      .from(xeroConnections)
      .where(eq(xeroConnections.portalId, TEST_PORTAL.id))
    return row
  }

  it('getConnectionForWorkspace returns the existing row for the portal', async () => {
    await seedXeroConnection()

    const connection = await (await service()).getConnectionForWorkspace()

    expect(connection.portalId).toBe(TEST_PORTAL.id)
    expect(connection.status).toBe(true)
  })

  it('getConnectionForWorkspace creates an inactive row when none exists', async () => {
    const connection = await (await service()).getConnectionForWorkspace()

    expect(connection.portalId).toBe(TEST_PORTAL.id)
    expect(connection.status).toBe(false)

    const rows = await db
      .select()
      .from(xeroConnections)
      .where(eq(xeroConnections.portalId, TEST_PORTAL.id))
    expect(rows).toHaveLength(1)
  })

  it('updateConnectionForWorkspace writes tokenSet and status for the portal', async () => {
    await seedXeroConnection({ status: false })

    const updated = await (await service()).updateConnectionForWorkspace({
      status: true,
      tokenSet: newTokenSet,
    })

    expect(updated.status).toBe(true)
    const row = await rowForPortal()
    expect(row.status).toBe(true)
    expect(row.tokenSet?.access_token).toBe('access-token-2')
  })

  it('deactivateConnectionIfActive returns true only on a real active to inactive transition', async () => {
    await seedXeroConnection({ status: true })
    const svc = await service()

    expect(await svc.deactivateConnectionIfActive()).toBe(true)
    expect(await svc.deactivateConnectionIfActive()).toBe(false)

    expect((await rowForPortal()).status).toBe(false)
  })
})
