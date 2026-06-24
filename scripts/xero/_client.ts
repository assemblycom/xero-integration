import { eq } from 'drizzle-orm'
import db from '@/db'
import { xeroConnections } from '@/db/schema/xeroConnections.schema'
import XeroAPI from '@/lib/xero/XeroAPI'

// Get an authed XeroAPI for a tenant. Refreshes the token if expired.
export async function getXeroForTenant(tenantId: string) {
  const connections = await db
    .select()
    .from(xeroConnections)
    .where(eq(xeroConnections.tenantId, tenantId))

  if (!connections.length) throw new Error(`No xero_connections row found for tenantId ${tenantId}`)
  // tenantId is not unique, so bail rather than guess the wrong portal.
  if (connections.length > 1) {
    throw new Error(`Multiple xero_connections rows for tenantId ${tenantId}; resolve manually`)
  }
  const [connection] = connections

  if (!connection.tokenSet?.refresh_token) {
    throw new Error(`Connection for tenantId ${tenantId} has no refresh token; re-authorize first`)
  }

  const xero = new XeroAPI()
  const refreshToken = connection.tokenSet.refresh_token
  let tokenSet = connection.tokenSet

  const isValid = tokenSet.expires_at ? tokenSet.expires_at * 1000 > Date.now() : false
  if (!isValid) {
    // Tokens rotate, so save the new one or the next run breaks.
    tokenSet = await xero.refreshWithRefreshToken(refreshToken)
    await db
      .update(xeroConnections)
      .set({ tokenSet })
      .where(eq(xeroConnections.portalId, connection.portalId))
  }

  xero.setTokenSet(tokenSet)
  return { xero, connection }
}
