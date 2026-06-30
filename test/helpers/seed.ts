import type { InferInsertModel } from 'drizzle-orm'
import type { TokenSet } from 'xero-node'
import db from '@/db'
import { settings } from '@/db/schema/settings.schema'
import { xeroConnections } from '@/db/schema/xeroConnections.schema'

export const TEST_PORTAL_ID = 'test-portal-00000001'
export const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111'
export const TEST_INTERNAL_USER_ID = '22222222-2222-2222-2222-222222222222'
export const TEST_WEBHOOK_TOKEN = 'test-token-xyz'
export const TEST_ACCESS_TOKEN = 'test-access-token'
export const TEST_REFRESH_TOKEN = 'test-refresh-token'

// expires_at is in seconds. One hour ahead keeps `isAccessTokenValid` true so
// tests don't trigger a real Xero OAuth refresh. Kept as a plain record so the
// shape stays inspectable; cast to TokenSet at the insert boundary below.
const validTokenSet = {
  access_token: TEST_ACCESS_TOKEN,
  refresh_token: TEST_REFRESH_TOKEN,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'accounting.transactions accounting.contacts offline_access',
}

type ConnectionOverrides = Partial<InferInsertModel<typeof xeroConnections>>
type SettingsOverrides = Partial<InferInsertModel<typeof settings>>

const baseConnection: InferInsertModel<typeof xeroConnections> = {
  portalId: TEST_PORTAL_ID,
  tenantId: TEST_TENANT_ID,
  // tokenSet is a jsonb column typed as the TokenSet class; we persist only the
  // JSON data fields, so cast here rather than reshaping the literal.
  tokenSet: validTokenSet as unknown as TokenSet,
  status: true,
  initiatedBy: TEST_INTERNAL_USER_ID,
}

export async function seedXeroConnection(overrides: ConnectionOverrides = {}) {
  const [row] = await db
    .insert(xeroConnections)
    .values({ ...baseConnection, ...overrides })
    .returning()
  return row
}

const baseSettings: InferInsertModel<typeof settings> = {
  portalId: TEST_PORTAL_ID,
  tenantId: TEST_TENANT_ID,
  // Cache a supported country so RegionService doesn't call live Xero.
  countryCode: 'US',
  isSyncEnabled: true,
  syncProductsAutomatically: true,
  addAbsorbedFees: false,
  useCompanyName: false,
}

export async function seedSettings(overrides: SettingsOverrides = {}) {
  const [row] = await db
    .insert(settings)
    .values({ ...baseSettings, ...overrides })
    .returning()
  return row
}

/**
 * Seeds the common "healthy connected portal" fixture: an active Xero
 * connection plus sync-enabled settings for the same portal x tenant.
 */
export async function seedConnectedPortal(
  opts: { connection?: ConnectionOverrides; settings?: SettingsOverrides } = {},
) {
  const connection = await seedXeroConnection(opts.connection)
  const setting = await seedSettings(opts.settings)
  return { connection, setting }
}
