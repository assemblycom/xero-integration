import { CountryCode } from 'xero-node'

// Ref: https://developer.xero.com/documentation/api/accounting/types#report-tax-types
export enum ReportTaxType {
  OUTPUT = 'OUTPUT',
}

export type SupportedCountry = CountryCode.US | CountryCode.AU

export interface RegionConfig {
  countryCode: SupportedCountry
  // Chart-of-accounts codes the integration creates/looks up
  accountCodes: { sales: string; bank: string; merchantFees: string }
  accountNames: { sales: string; expense: string; asset: string }
  // tax.reportTaxType is required by Xero AU for custom tax-rate creation; omitted for US
  tax: { reportTaxType?: ReportTaxType; label: string }
  locale: string
  currency: string
}

// Ref: https://www.xero.com/glossary/chart-of-accounts/
// Ref: https://www.cubesoftware.com/blog/chart-of-accounts
export const REGION_CONFIG = {
  [CountryCode.US]: {
    countryCode: CountryCode.US,
    accountCodes: { sales: '4000', bank: '2001', merchantFees: '6041' },
    accountNames: {
      sales: 'Sale of Goods',
      expense: 'Assembly Processing Fees',
      asset: 'Assembly Asset Account',
    },
    tax: { reportTaxType: undefined, label: 'Sales Tax' }, // Ref: https://developer.xero.com/documentation/api/accounting/types#report-tax-types
    locale: 'en-US',
    currency: 'USD',
  },
  [CountryCode.AU]: {
    countryCode: CountryCode.AU,
    // Dedicated high "Assembly" block (90xx) chosen to sit clear of Xero AU's default
    // chart of accounts (which tops out in the 900s), so find-or-create won't collide with an existing AU account.
    accountCodes: { sales: '9000', bank: '9010', merchantFees: '9020' },
    accountNames: {
      sales: 'Sale of Goods',
      expense: 'Assembly Processing Fees',
      asset: 'Assembly Asset Account',
    },
    tax: { reportTaxType: ReportTaxType.OUTPUT, label: 'GST' }, // Ref: https://developer.xero.com/documentation/api/accounting/types#report-tax-types
    locale: 'en-AU',
    currency: 'AUD',
  },
} as const satisfies Record<SupportedCountry, RegionConfig>

export const SUPPORTED_COUNTRIES = [CountryCode.US, CountryCode.AU] as const

export const isSupportedCountry = (
  countryCode: CountryCode | string | null | undefined,
): countryCode is SupportedCountry =>
  countryCode != null && (SUPPORTED_COUNTRIES as readonly unknown[]).includes(countryCode)

export const regionConfigFor = (countryCode: SupportedCountry): RegionConfig =>
  REGION_CONFIG[countryCode]

/**
 * Formats an amount in the region's currency/locale. Falls back to US formatting for
 * unsupported/unknown regions (the app UI still renders for them).
 */
export const formatCurrencyForRegion = (
  amount: number,
  countryCode: CountryCode | string | null | undefined,
): string => {
  const config = isSupportedCountry(countryCode)
    ? REGION_CONFIG[countryCode]
    : REGION_CONFIG[CountryCode.US]
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
  }).format(amount || 0)
}
