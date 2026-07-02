import { TEST_PORTAL, TEST_PRODUCT, TEST_TOKENS, TEST_XERO_ITEM } from '@test/helpers/constants'
import type { InferInsertModel } from 'drizzle-orm'
import type { TokenSet } from 'xero-node'
import db from '@/db'
import { settings } from '@/db/schema/settings.schema'
import { syncedItems } from '@/db/schema/syncedItems.schema'
import { xeroConnections } from '@/db/schema/xeroConnections.schema'

type ConnectionOverrides = Partial<InferInsertModel<typeof xeroConnections>>
type SettingsOverrides = Partial<InferInsertModel<typeof settings>>

// Built per seed so expires_at stays in the future, keeping the token valid.
// Cast because we only store the TokenSet JSON fields.
function buildBaseConnection(): InferInsertModel<typeof xeroConnections> {
  const validTokenSet = {
    access_token: TEST_TOKENS.access,
    refresh_token: TEST_TOKENS.refresh,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'Bearer',
    scope: 'accounting.transactions accounting.contacts offline_access',
  }
  return {
    portalId: TEST_PORTAL.id,
    tenantId: TEST_PORTAL.tenantId,
    tokenSet: validTokenSet as unknown as TokenSet,
    status: true,
    initiatedBy: TEST_PORTAL.internalUserId,
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
  portalId: TEST_PORTAL.id,
  tenantId: TEST_PORTAL.tenantId,
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

// Seeds an active Xero connection plus sync-enabled settings for one portal.
export async function seedConnectedPortal(
  opts: { connection?: ConnectionOverrides; settings?: SettingsOverrides } = {},
) {
  const connection = await seedXeroConnection(opts.connection)
  const setting = await seedSettings(opts.settings)
  return { connection, setting }
}

type SyncedItemOverrides = Partial<InferInsertModel<typeof syncedItems>>

const baseSyncedItem: InferInsertModel<typeof syncedItems> = {
  portalId: TEST_PORTAL.id,
  tenantId: TEST_PORTAL.tenantId,
  productId: TEST_PRODUCT.id,
  itemId: TEST_XERO_ITEM.id,
}

export async function seedSyncedItem(overrides: SyncedItemOverrides = {}) {
  const [row] = await db
    .insert(syncedItems)
    .values({ ...baseSyncedItem, ...overrides })
    .returning()
  return row
}
