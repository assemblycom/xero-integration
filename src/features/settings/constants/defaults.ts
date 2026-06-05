import type { SettingsFields } from '@/db/schema/settings.schema'

export const defaultSettings: SettingsFields = {
  syncProductsAutomatically: false,
  addAbsorbedFees: false,
  useCompanyName: false,
  initialInvoiceSettingsMapping: false,
  initialProductSettingsMapping: false,
  isSyncEnabled: false,
  countryCode: null,
}
