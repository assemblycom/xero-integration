import { TEST_INTERNAL_USER_ID, TEST_PORTAL_ID, TEST_XERO_ITEM_ID } from '@test/helpers/seed'
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
      workspaceId: TEST_PORTAL_ID,
      internalUserId: TEST_INTERNAL_USER_ID,
    }),
    ...overrides,
  }
}

// Mocked XeroAPI. Defaults cover the product.created happy path:
// - setTokenSet: no-op (called in the service constructor)
// - getOrganisationCountryCode: a supported region, so no live call
// - createItems: echoes the code and gives each item a unique uuid, like real
//   Xero. The first item keeps TEST_XERO_ITEM_ID for single-product asserts.
export function createMockXeroAPI(overrides: XeroAPIOverrides = {}) {
  return {
    setTokenSet: vi.fn(),
    getOrganisationCountryCode: vi.fn().mockResolvedValue('US'),
    createItems: vi.fn(async (_tenantId: string, items: CreateItemInput[]) =>
      items.map((item, index) => ({
        itemID:
          index === 0
            ? TEST_XERO_ITEM_ID
            : `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`,
        code: item.code,
        name: item.name,
        description: item.description,
      })),
    ),
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
