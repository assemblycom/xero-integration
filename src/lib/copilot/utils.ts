import type { ClientResponse } from './types'

export const buildClientName = (client: { givenName: string; familyName: string }) =>
  `${client.givenName} ${client.familyName}`

const ACTIVE_CLIENT_STATUS = 'active'

// Returns the earliest-created active client, or undefined if none are active.
export const getEarliestActiveClient = (clients: ClientResponse[]): ClientResponse | undefined =>
  clients
    .filter((client) => client.status === ACTIVE_CLIENT_STATUS)
    .reduce<ClientResponse | undefined>(
      (earliest, client) =>
        !earliest || new Date(client.createdAt) < new Date(earliest.createdAt) ? client : earliest,
      undefined,
    )
