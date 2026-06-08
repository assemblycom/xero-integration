import 'server-only'

import { sendAuthorizationFailedNotification } from '@auth/lib/Auth.helpers'
import XeroConnectionsService from '@auth/lib/XeroConnections.service'
import type { TokenSet } from 'xero-node'
import type { XeroConnection, XeroConnectionWithTokenSet } from '@/db/schema/xeroConnections.schema'
import type User from '@/lib/copilot/models/User.model'
import BaseService from '@/lib/copilot/services/base.service'
import logger from '@/lib/logger'
import XeroConnectionFailedError from '@/lib/xero/errors/XeroConnectionFailedError'
import XeroAPI from '@/lib/xero/XeroAPI'

class AuthService extends BaseService {
  connectionsService: XeroConnectionsService

  constructor(user: User) {
    super(user)
    this.connectionsService = new XeroConnectionsService(this.user)
  }

  async handleXeroConnectionCallback(
    urlParams: Record<string, string | string[] | undefined>,
  ): Promise<XeroConnection> {
    logger.info(
      'AuthService#handleXeroConnectionCallback :: Handling Xero connection callback with url params',
      urlParams,
    )

    let tokenSet: TokenSet, tenantId: string
    try {
      const xero = new XeroAPI()
      tokenSet = await xero.handleApiCallback(urlParams)
      tenantId = await xero.getActiveTenantId()
    } catch (error) {
      logger.error(
        'AuthService#handleXeroConnectionCallback :: Error handling Xero callback:',
        error,
      )
      throw new Error('Error handling Xero callback', { cause: error })
    }

    const xeroConnectionsService = new XeroConnectionsService(this.user)
    return await xeroConnectionsService.updateConnectionForWorkspace({
      tokenSet,
      tenantId,
      status: true,
    })
  }

  private async handleRefreshFailure({
    safe,
    notify,
    connection,
  }: {
    safe: boolean
    notify: boolean
    connection?: XeroConnection
  }) {
    logger.info(
      'AuthService#handleRefreshFailure :: Handling refresh failure for safe mode',
      safe,
      'and connection',
      connection?.id,
    )

    if (!safe) {
      if (notify) await sendAuthorizationFailedNotification(this.user, connection)
      throw new XeroConnectionFailedError()
    }
  }

  /**
   * Authorize Xero for a Copilot workspace using a token payload
   * Ref: https://developer.xero.com/documentation/guides/oauth2/auth-flow/
   * @param safe - When `true`, swallow auth errors instead of throwing/notifying.
   */
  // Overloads
  authorizeXeroForCopilotWorkspace(): Promise<XeroConnectionWithTokenSet>
  authorizeXeroForCopilotWorkspace(safe: true): Promise<XeroConnection>
  authorizeXeroForCopilotWorkspace(safe: false): Promise<XeroConnectionWithTokenSet>
  // Method definition
  async authorizeXeroForCopilotWorkspace(
    safe: boolean = false,
  ): Promise<XeroConnection | XeroConnectionWithTokenSet> {
    logger.info(
      'AuthService#authorizeXeroForCopilotWorkspace :: Authorizing request with safe mode',
      safe,
    )

    // Find corresponding Xero connection for the workspace
    let connection = await this.connectionsService.getConnectionForWorkspace()
    const isAccessTokenValid =
      connection.tokenSet?.access_token && connection.tokenSet?.expires_at
        ? connection.tokenSet.expires_at * 1000 > Date.now()
        : false
    logger.info(
      'AuthService#authorizeXeroForCopilotWorkspace :: Found connection',
      connection.id,
      'with validity',
      isAccessTokenValid,
    )

    // --- Handle active connection
    if (!isAccessTokenValid) {
      // --- Handle inactive connection
      // Only the first failure flips active->inactive, so we notify once even when
      // many webhooks fail at the same time. (Re-flipped to active on refresh below.)
      const didDeactivate = await this.connectionsService.deactivateConnectionIfActive()
      connection = { ...connection, status: false }

      // If Xero connection was not found or unrefreshable. Send a mail prompting IUs to re-authorize
      if (!connection.tokenSet || !connection.tokenSet.refresh_token) {
        logger.info(
          'AuthService#authorizeXeroForCopilotWorkspace :: Unable to refresh Xero access token, no refresh token available',
        )
        await this.handleRefreshFailure({ safe, notify: didDeactivate, connection })
      } else {
        logger.info('AuthService#authorizeXeroForCopilotWorkspace :: Refreshing Xero access token')
        // Attempt to refresh access token via refresh token
        let tokenSet: TokenSet
        try {
          const xero = new XeroAPI()
          tokenSet = await xero.refreshWithRefreshToken(connection.tokenSet.refresh_token)
          return await this.connectionsService.updateConnectionForWorkspace({
            tokenSet,
            status: true,
          })
        } catch (e: unknown) {
          // If unable to refresh, send notification email
          logger.error('Error refreshing Xero access token:', e)
          await this.handleRefreshFailure({ safe, notify: didDeactivate, connection })
        }
      }
    }
    return connection
  }
}

export default AuthService
