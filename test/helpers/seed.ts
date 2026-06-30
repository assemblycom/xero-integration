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

type ConnectionOverrides = Partial<InferInsertModel<typeof xeroConnections>>
type SettingsOverrides = Partial<InferInsertModel<typeof settings>>

// Built per seed so expires_at stays in the future on long runs, keeping the
// token valid. Cast because we store only the TokenSet JSON fields.
function buildBaseConnection(): InferInsertModel<typeof xeroConnections> {
  const validTokenSet = {
    access_token: TEST_ACCESS_TOKEN,
    refresh_token: TEST_REFRESH_TOKEN,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'Bearer',
    scope: 'accounting.transactions accounting.contacts offline_access',
  }
  return {
    portalId: TEST_PORTAL_ID,
    tenantId: TEST_TENANT_ID,
    tokenSet: validTokenSet as unknown as TokenSet,
    status: true,
    initiatedBy: TEST_INTERNAL_USER_ID,
  }
}

export async function seedXeroConnection(overrides: ConnectionOverrides = {}) {
  const [row] = await db
    .insert(xeroConnections)
    .values({ ...buildBaseConnection(), ...overrides })
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
