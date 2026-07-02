import {
  TEST_CLIENT,
  TEST_COMPANY,
  TEST_PORTAL,
  TEST_SALES_ACCOUNT,
  TEST_XERO_CONTACT,
  TEST_XERO_INVOICE,
  TEST_XERO_ITEM,
} from '@test/helpers/constants'
import { type Mock, vi } from 'vitest'
import { CopilotAPI } from '@/lib/copilot/CopilotAPI'
import XeroAPI from '@/lib/xero/XeroAPI'

// Minimal shape of the item payload SyncedItemsService sends to Xero.
type CreateItemInput = { code: string; name: string; description?: string }

// Only real method names can be overridden, so typos fail at compile time.
type MockMethodOverrides<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => unknown ? K : never]?: Mock
}

type CopilotAPIOverrides = MockMethodOverrides<CopilotAPI>
type XeroAPIOverrides = MockMethodOverrides<XeroAPI>

// Mocked CopilotAPI. Override any method per test via `overrides`.
export function createMockCopilotAPI(overrides: CopilotAPIOverrides = {}) {
  return {
    getTokenPayload: vi.fn().mockResolvedValue({
      workspaceId: TEST_PORTAL.id,
      internalUserId: TEST_PORTAL.internalUserId,
    }),
    getClient: vi.fn().mockResolvedValue({
      id: TEST_CLIENT.id,
      givenName: TEST_CLIENT.givenName,
      familyName: TEST_CLIENT.familyName,
      email: TEST_CLIENT.email,
      companyIds: [TEST_COMPANY.id],
      status: 'active',
      avatarImageUrl: null,
      fallbackColor: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
    ...overrides,
  }
}

// Mocked XeroAPI. Defaults cover the product.created and invoice.created happy paths:
// - setTokenSet: no-op (called in the service constructor)
// - getOrganisationCountryCode: a supported region, so no live call
// - createItems: echoes the code and gives each item a unique uuid, like real
//   Xero. The first item keeps TEST_XERO_ITEM.id for single-product asserts.
export function createMockXeroAPI(overrides: XeroAPIOverrides = {}) {
  return {
    setTokenSet: vi.fn(),
    getOrganisationCountryCode: vi.fn().mockResolvedValue('US'),
    createItems: vi.fn(async (_tenantId: string, items: CreateItemInput[]) =>
      items.map((item, index) => ({
        itemID:
          index === 0
            ? TEST_XERO_ITEM.id
            : `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`,
        code: item.code,
        name: item.name,
        description: item.description,
      })),
    ),
    // Item lookup for line-item mapping; empty so lines fall back to the copilot description.
    getItems: vi.fn().mockResolvedValue([]),
    // No pre-existing accounts, so the sales account is created on the region-default path.
    getAccounts: vi.fn().mockResolvedValue([]),
    createSalesAccount: vi.fn(
      async (_tenantId: string, account: { code: string; name: string }) => ({
        accountID: TEST_SALES_ACCOUNT.id,
        code: account.code,
        name: account.name,
        type: 'REVENUE',
        status: 'ACTIVE',
        enablePaymentsToAccount: true,
      }),
    ),
    enablePaymentsForAccount: vi.fn().mockResolvedValue(undefined),
    // No matching tax rate, so a region-specific rate is created.
    getTaxRates: vi.fn().mockResolvedValue([]),
    createTaxRate: vi.fn(
      async (
        _tenantId: string,
        taxRate: { name: string; reportTaxType?: string; taxComponents?: { rate: number }[] },
      ) => ({
        name: taxRate.name,
        reportTaxType: taxRate.reportTaxType,
        taxType: 'ASSEMBLYTAX',
        effectiveRate: taxRate.taxComponents?.[0]?.rate ?? 0,
        status: 'ACTIVE',
      }),
    ),
    // New-contact path: no synced contact seeded, so createContact is what runs.
    getContact: vi.fn().mockResolvedValue(undefined),
    createContact: vi.fn(
      async (
        _tenantId: string,
        contact: { name: string; emailAddress?: string; firstName?: string; lastName?: string },
      ) => ({
        contactID: TEST_XERO_CONTACT.id,
        name: contact.name,
        emailAddress: contact.emailAddress,
        firstName: contact.firstName,
        lastName: contact.lastName,
      }),
    ),
    createInvoice: vi.fn(async (_tenantId: string, invoice: { invoiceNumber?: string }) => ({
      invoiceID: TEST_XERO_INVOICE.id,
      invoiceNumber: invoice.invoiceNumber,
      status: 'AUTHORISED',
    })),
    ...overrides,
  }
}

export type MockCopilotAPI = ReturnType<typeof createMockCopilotAPI>
export type MockXeroAPI = ReturnType<typeof createMockXeroAPI>

// Points the CopilotAPI + XeroAPI constructors at shared mock instances and
// returns them so tests can assert on calls. Uses `function` so `new` works.
// Note: a request may build CopilotAPI more than once, so call counts add up.
export function installMockApis(opts: { copilot?: MockCopilotAPI; xero?: MockXeroAPI } = {}): {
  copilot: MockCopilotAPI
  xero: MockXeroAPI
} {
  const copilot = opts.copilot ?? createMockCopilotAPI()
  const xero = opts.xero ?? createMockXeroAPI()

  vi.mocked(CopilotAPI).mockImplementation(function (this: unknown): CopilotAPI {
    return copilot as unknown as CopilotAPI
  } as unknown as typeof CopilotAPI)

  vi.mocked(XeroAPI).mockImplementation(function (this: unknown): XeroAPI {
    return xero as unknown as XeroAPI
  } as unknown as typeof XeroAPI)

  return { copilot, xero }
}
