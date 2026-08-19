import { assemblyApi } from '@assembly-js/node-sdk'
import env from '@/config/server.env'
import { type Token, TokenSchema } from '@/lib/copilot/types'
import { withRetry } from '@/lib/copilot/withRetry'
import logger from '@/lib/logger'
import type { ClientResponse } from './types'

export const buildClientName = (client: { givenName: string; familyName: string }) =>
  `${client.givenName} ${client.familyName}`

const ACTIVE_CLIENT_STATUS = 'active'

// Returns the earliest-created active client, or undefined if none are active.
export const getEarliestActiveClient = (clients: ClientResponse[]): ClientResponse | undefined =>
  clients.reduce<ClientResponse | undefined>(
    (earliest, client) =>
      client.status === ACTIVE_CLIENT_STATUS &&
      (!earliest || new Date(client.createdAt) < new Date(earliest.createdAt))
        ? client
        : earliest,
    undefined,
  )

const decodeTokenPayload = async (token: string): Promise<Token> => {
  // Decoding needs the request token, so scope the SDK by token here.
  const sdk = await assemblyApi({ apiKey: env.COPILOT_API_KEY, token })
  if (!sdk.getTokenPayload) {
    throw new Error('getAssemblyTokenPayload | SDK cannot decode token')
  }
  return TokenSchema.parse(await sdk.getTokenPayload())
}

// Decodes a request token. Returns null on failure so callers map it to a
// typed auth error.
export async function getAssemblyTokenPayload(token: string): Promise<Token | null> {
  try {
    return await withRetry(decodeTokenPayload, [token])
  } catch (err) {
    logger.error('getAssemblyTokenPayload | failed to decode token payload', err)
    return null
  }
}
