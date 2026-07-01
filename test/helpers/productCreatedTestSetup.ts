import { installMockApis, type MockCopilotAPI, type MockXeroAPI } from '@test/helpers/mocks'
import { truncateAllTestTables } from '@test/helpers/testDb'
import { beforeEach } from 'vitest'

type InstallOpts = Parameters<typeof installMockApis>[0]

export interface ProductCreatedTestHandle {
  copilot: MockCopilotAPI
  xero: MockXeroAPI
}

/**
 * Registers the standard `beforeEach` (truncate + installMockApis) for
 * product.created integration tests. Returns a live handle whose `copilot` /
 * `xero` are replaced with fresh mock instances before each test. `optsFactory`
 * runs per test so overrides get freshly instantiated `vi.fn()`s.
 * Mock call history is reset by `clearMocks: true` in vitest.config.ts.
 */
export function setupProductCreatedTest(optsFactory?: () => InstallOpts): ProductCreatedTestHandle {
  const handle = {} as ProductCreatedTestHandle

  beforeEach(async () => {
    await truncateAllTestTables()
    const { copilot, xero } = installMockApis(optsFactory?.())
    handle.copilot = copilot
    handle.xero = xero
  })

  return handle
}
