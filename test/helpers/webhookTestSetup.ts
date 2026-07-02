import { installMockApis, type MockCopilotAPI, type MockXeroAPI } from '@test/helpers/mocks'
import { truncateAllTestTables } from '@test/helpers/testDb'
import { beforeEach } from 'vitest'

type InstallOpts = Parameters<typeof installMockApis>[0]

export interface WebhookTestHandle {
  copilot: MockCopilotAPI
  xero: MockXeroAPI
}

// beforeEach for webhook integration tests: truncates the DB and installs fresh
// mocks. Returns a handle with the current test's copilot/xero mocks.
// `optsFactory` runs per test so overrides get fresh vi.fn()s.
export function setupWebhookTest(optsFactory?: () => InstallOpts): WebhookTestHandle {
  const handle = {} as WebhookTestHandle

  beforeEach(async () => {
    await truncateAllTestTables()
    const { copilot, xero } = installMockApis(optsFactory?.())
    handle.copilot = copilot
    handle.xero = xero
  })

  return handle
}
