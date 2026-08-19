import { z } from 'zod'
import { CopilotAPI } from '@/lib/copilot/CopilotAPI'
import CopilotInvalidTokenError from '@/lib/copilot/errors/CopilotInvalidTokenError'
import CopilotNoTokenError from '@/lib/copilot/errors/CopilotNoTokenError'
import type { Token } from '@/lib/copilot/types'
import { getAssemblyTokenPayload } from '@/lib/copilot/utils'
import logger from '@/lib/logger'

class User {
  internalUserId?: string
  readonly portalId: string
  readonly copilot: CopilotAPI

  constructor(
    public readonly token: string,
    tokenPayload: Token,
    copilot?: CopilotAPI,
  ) {
    this.internalUserId = tokenPayload.internalUserId
    this.portalId = tokenPayload.workspaceId
    this.copilot = copilot || new CopilotAPI(tokenPayload.workspaceId)
  }

  /**
   * Authenticates a Copilot user by token
   * @param token
   * @returns User instance modeled from the token payload
   * @throws CopilotNoTokenError when no token is provided
   * @throws CopilotInvalidTokenError when the token is invalid or cannot be decoded
   */
  static async authenticate(token?: unknown): Promise<User> {
    if (!token) {
      throw new CopilotNoTokenError()
    }

    const tokenParsed = z.string().min(1).safeParse(token)

    if (!tokenParsed.success) {
      logger.info('User#authenticate :: Token parse error', tokenParsed.error)
      throw new CopilotInvalidTokenError()
    }

    const tokenPayload = await getAssemblyTokenPayload(tokenParsed.data)
    if (!tokenPayload) {
      throw new CopilotInvalidTokenError('Unable to decode Copilot token payload')
    }

    return new User(tokenParsed.data, tokenPayload)
  }
}

export default User
