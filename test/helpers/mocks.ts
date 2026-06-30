import { TEST_INTERNAL_USER_ID, TEST_PORTAL_ID } from '@test/helpers/seed'
import { type Mock, vi } from 'vitest'
import { CopilotAPI } from '@/lib/copilot/CopilotAPI'
import XeroAPI from '@/lib/xero/XeroAPI'

// Restricts override keys to the actual method names of the underlying class so
// typos produce a compile-time error. The Mock value type stays loose — tests
// routinely return shapes that don't match the real Promise return type.
type MockMethodOverrides<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => unknown ? K : never]?: Mock
}

type CopilotAPIOverrides = MockMethodOverrides<CopilotAPI>
type XeroAPIOverrides = MockMethodOverrides<XeroAPI>

/**
 * Factory for a mocked CopilotAPI instance. Override any method via `overrides`
 * to tailor behavior per test.
 */
export function createMockCopilotAPI(overrides: CopilotAPIOverrides = {}) {
  return {
    getTokenPayload: vi.fn().mockResolvedValue({
      workspaceId: TEST_PORTAL_ID,
      internalUserId: TEST_INTERNAL_USER_ID,
    }),
    ...overrides,
  }
}

/**
 * Factory for a mocked XeroAPI instance. `setTokenSet` is a no-op spy because
 * AuthenticatedXeroService calls it in its constructor. `getOrganisationCountryCode`
 * defaults to a supported region so RegionService resolves without a live call.
 */
export function createMockXeroAPI(overrides: XeroAPIOverrides = {}) {
  return {
    setTokenSet: vi.fn(),
    getOrganisationCountryCode: vi.fn().mockResolvedValue('US'),
    ...overrides,
  }
}

export type MockCopilotAPI = ReturnType<typeof createMockCopilotAPI>
export type MockXeroAPI = ReturnType<typeof createMockXeroAPI>

/**
 * Wires the module-mocked CopilotAPI + XeroAPI constructors to shared instances
 * and returns them so tests can assert on calls. Uses `function` (not arrow) so
 * the mock is callable with `new`.
 *
 * Caveat: one request may construct CopilotAPI several times (auth + sync flow) —
 * all share this instance, so call counts sum across sites.
 */
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
