import { boolean, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { createSelectSchema, createUpdateSchema } from 'drizzle-zod'
import type z from 'zod'
import { getTableFields, timestamps } from '@/db/db.helpers'

export const settings = pgTable(
  'settings',
  {
    id: uuid().primaryKey().notNull().defaultRandom(),

    // Workspace ID / Portal ID in Copilot
    portalId: varchar({ length: 64 }).notNull(),

    // Active Tenant ID (most recently connected Xero organization)
    tenantId: uuid().notNull(),

    // Xero organisation country code (e.g. 'US', 'AU'); null until first resolved
    countryCode: varchar({ length: 8 }),

    // User-selected Xero accounts (AccountID GUID). Null => fall back to region defaults.
    incomeAccountId: uuid(),
    bankAccountId: uuid(),
    expenseAccountId: uuid(),

    // Settings form checkbox flags
    syncProductsAutomatically: boolean().notNull().default(false),
    addAbsorbedFees: boolean().notNull().default(false),
    useCompanyName: boolean().notNull().default(false),

    // Whether or not sync is "Enabled" in this portal x tenantId
    isSyncEnabled: boolean().notNull().default(false),

    // Flags if user is mapping invoice settings for the first time
    initialInvoiceSettingsMapping: boolean().notNull().default(false),
    initialProductSettingsMapping: boolean().notNull().default(false),

    // Flags if user is mapping on the products table for the first time
    ...timestamps,
  },
  // Only allow one setting per portal x tenantId (each synced tenant must have a different setting)
  (t) => [uniqueIndex('uq_settings_portal_id_tenant_id').on(t.portalId, t.tenantId)],
)

export const SettingsSchema = createSelectSchema(settings)
export type Settings = z.infer<typeof SettingsSchema>
export type SettingsFields = Omit<
  Settings,
  'id' | 'portalId' | 'tenantId' | 'createdAt' | 'updatedAt'
>

// Canonical column set returned when reading/updating settings. Shared by Settings.service
// and updateSettingsAction so a new column is exposed in exactly one place.
export const SETTINGS_SELECT_FIELDS = getTableFields(settings, [
  'syncProductsAutomatically',
  'addAbsorbedFees',
  'useCompanyName',
  'isSyncEnabled',
  'initialInvoiceSettingsMapping',
  'initialProductSettingsMapping',
  'countryCode',
  'incomeAccountId',
  'bankAccountId',
  'expenseAccountId',
])

// countryCode is set server-side only, so keep it out of client updates.
// The *AccountId fields are intentionally client-writable (set from the settings UI).
export const SettingsUpdateSchema = createUpdateSchema(settings).omit({
  id: true,
  portalId: true,
  tenantId: true,
  countryCode: true,
  createdAt: true,
  updatedAt: true,
})
