import type { ClientResponse } from './types'

export const buildClientName = (client: { givenName: string; familyName: string }) =>
  `${client.givenName} ${client.familyName}`

const ACTIVE_CLIENT_STATUS = 'active'

// Returns the earliest-created active client, or undefined if none are active.
// createdAt is an ISO string, so lexical comparison orders chronologically.
export const getEarliestActiveClient = (clients: ClientResponse[]): ClientResponse | undefined =>
  clients
    .filter((client) => client.status === ACTIVE_CLIENT_STATUS)
    .reduce<ClientResponse | undefined>(
      (earliest, client) =>
        !earliest || client.createdAt < earliest.createdAt ? client : earliest,
      undefined,
    )
