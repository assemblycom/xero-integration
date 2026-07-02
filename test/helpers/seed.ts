import {
  TEST_CLIENT,
  TEST_INVOICE,
  TEST_PORTAL,
  TEST_PRODUCT,
  TEST_SALES_ACCOUNT,
  TEST_TOKENS,
  TEST_XERO_CONTACT,
  TEST_XERO_INVOICE,
  TEST_XERO_ITEM,
} from '@test/helpers/constants'
import type { InferInsertModel } from 'drizzle-orm'
import type { TokenSet } from 'xero-node'
import db from '@/db'
import { settings } from '@/db/schema/settings.schema'
import { SyncedContactUserType, syncedContacts } from '@/db/schema/syncedContacts.schema'
import { syncedInvoices } from '@/db/schema/syncedInvoices.schema'
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

type SyncedInvoiceOverrides = Partial<InferInsertModel<typeof syncedInvoices>>

const baseSyncedInvoice: InferInsertModel<typeof syncedInvoices> = {
  portalId: TEST_PORTAL.id,
  tenantId: TEST_PORTAL.tenantId,
  copilotInvoiceId: TEST_INVOICE.id,
  xeroInvoiceId: TEST_XERO_INVOICE.id,
  salesAccountId: TEST_SALES_ACCOUNT.id,
  status: 'success',
}

// Seeds a synced_invoices row. Defaults to a fully-synced ('success') invoice
// for idempotency tests; override `status`/ids as needed.
export async function seedSyncedInvoice(overrides: SyncedInvoiceOverrides = {}) {
  const [row] = await db
    .insert(syncedInvoices)
    .values({ ...baseSyncedInvoice, ...overrides })
    .returning()
  return row
}

type SyncedContactOverrides = Partial<InferInsertModel<typeof syncedContacts>>

const baseSyncedContact: InferInsertModel<typeof syncedContacts> = {
  portalId: TEST_PORTAL.id,
  tenantId: TEST_PORTAL.tenantId,
  clientOrCompanyId: TEST_CLIENT.id,
  userType: SyncedContactUserType.CLIENT,
  contactId: TEST_XERO_CONTACT.id,
}

// Seeds a synced_contacts row (client-billed by default). Available for the
// contact-reuse path; not used by the baseline new-contact tests.
export async function seedSyncedContact(overrides: SyncedContactOverrides = {}) {
  const [row] = await db
    .insert(syncedContacts)
    .values({ ...baseSyncedContact, ...overrides })
    .returning()
  return row
}
