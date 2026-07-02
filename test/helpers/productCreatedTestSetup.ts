import { installMockApis, type MockCopilotAPI, type MockXeroAPI } from '@test/helpers/mocks'
import { truncateAllTestTables } from '@test/helpers/testDb'
import { beforeEach } from 'vitest'

type InstallOpts = Parameters<typeof installMockApis>[0]

export interface ProductCreatedTestHandle {
  copilot: MockCopilotAPI
  xero: MockXeroAPI
}

// beforeEach for product.created tests: truncates the DB and installs fresh
// mocks. Returns a handle with the current test's copilot/xero mocks.
// `optsFactory` runs per test so overrides get fresh vi.fn()s.
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
