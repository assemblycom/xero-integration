import AuthService from '@auth/lib/Auth.service'
import { TEST_PORTAL, TEST_TOKENS } from '@test/helpers/constants'
import { createMockCopilotAPI, createMockXeroAPI } from '@test/helpers/mocks'
import { seedXeroConnection } from '@test/helpers/seed'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { TokenSet } from 'xero-node'
import db from '@/db'
import { xeroConnections } from '@/db/schema/xeroConnections.schema'
import User from '@/lib/copilot/models/User.model'
import XeroConnectionFailedError from '@/lib/xero/errors/XeroConnectionFailedError'

const now = () => Math.floor(Date.now() / 1000)

// An expired access token with a usable refresh token, so authorize takes the refresh path.
const expiredWithRefresh = {
  access_token: 'expired-access-token',
  refresh_token: 'refresh-token-1',
  expires_at: now() - 3600,
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'accounting.transactions offline_access',
} as unknown as TokenSet

// An expired access token with no refresh token, so no refresh can be attempted.
const expiredWithoutRefresh = {
  access_token: 'expired-access-token',
  expires_at: now() - 3600,
  token_type: 'Bearer',
  scope: 'accounting.transactions offline_access',
} as unknown as TokenSet

// A fresh token the refresh call returns on success.
const refreshedTokenSet = {
  access_token: 'new-access-token',
  refresh_token: 'new-refresh-token',
  expires_at: now() + 3600,
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'accounting.transactions offline_access',
} as unknown as TokenSet

describe('AuthService#authorizeXeroForCopilotWorkspace', () => {
  const apis = setupWebhookTest(() => ({
    xero: createMockXeroAPI({ refreshWithRefreshToken: vi.fn() }),
    copilot: createMockCopilotAPI({
      getInternalUsers: vi.fn().mockResolvedValue({ data: [{ id: 'internal-user-1' }] }),
      createNotification: vi.fn().mockResolvedValue(undefined),
    }),
  }))

  const authService = async () => new AuthService(await User.authenticate(TEST_TOKENS.webhook))

  // The factory always installs this mock; narrow away its optional type.
  const refreshMock = () => {
    const mock = apis.xero.refreshWithRefreshToken
    if (!mock) throw new Error('refreshWithRefreshToken mock not installed')
    return mock
  }

  it('returns the connection without refreshing when the access token is valid', async () => {
    await seedXeroConnection() // valid token, active

    const connection = await (await authService()).authorizeXeroForCopilotWorkspace()

    expect(connection.status).toBe(true)
    expect(refreshMock()).not.toHaveBeenCalled()
  })

  it('refreshes an expired token, saves it, and reactivates the connection', async () => {
    await seedXeroConnection({ status: false, tokenSet: expiredWithRefresh })
    refreshMock().mockResolvedValue(refreshedTokenSet)

    const connection = await (await authService()).authorizeXeroForCopilotWorkspace()

    expect(refreshMock()).toHaveBeenCalledWith('refresh-token-1')
    expect(connection.status).toBe(true)
    expect(connection.tokenSet.access_token).toBe('new-access-token')

    const [row] = await db
      .select()
      .from(xeroConnections)
      .where(eq(xeroConnections.portalId, TEST_PORTAL.id))
    expect(row.status).toBe(true)
    expect(row.tokenSet?.access_token).toBe('new-access-token')
  })

  it('throws and leaves the connection inactive when the refresh fails', async () => {
    await seedXeroConnection({ status: false, tokenSet: expiredWithRefresh })
    refreshMock().mockRejectedValue(new Error('invalid_grant'))

    await expect((await authService()).authorizeXeroForCopilotWorkspace()).rejects.toBeInstanceOf(
      XeroConnectionFailedError,
    )

    const [row] = await db
      .select()
      .from(xeroConnections)
      .where(eq(xeroConnections.portalId, TEST_PORTAL.id))
    expect(row.status).toBe(false)
    // Already inactive, so no owner notification this time.
    expect(apis.copilot.createNotification).not.toHaveBeenCalled()
  })

  it('does not attempt a refresh when there is no refresh token', async () => {
    await seedXeroConnection({ status: false, tokenSet: expiredWithoutRefresh })

    await expect((await authService()).authorizeXeroForCopilotWorkspace()).rejects.toBeInstanceOf(
      XeroConnectionFailedError,
    )
    expect(refreshMock()).not.toHaveBeenCalled()
  })

  it('notifies the workspace once on the active to inactive flip', async () => {
    await seedXeroConnection({ status: true, tokenSet: expiredWithRefresh })
    refreshMock().mockRejectedValue(new Error('invalid_grant'))

    // safe mode returns instead of throwing, so both calls run in one test.
    await (await authService()).authorizeXeroForCopilotWorkspace(true)
    await (await authService()).authorizeXeroForCopilotWorkspace(true)

    expect(apis.copilot.createNotification).toHaveBeenCalledTimes(1)
  })

  it('returns the inactive connection instead of throwing in safe mode', async () => {
    await seedXeroConnection({ status: false, tokenSet: expiredWithRefresh })
    refreshMock().mockRejectedValue(new Error('invalid_grant'))

    const connection = await (await authService()).authorizeXeroForCopilotWorkspace(true)

    expect(connection.status).toBe(false)
  })
})
