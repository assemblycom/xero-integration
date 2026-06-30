import { vi } from 'vitest'

/**
 * Shared module mocks for all integration tests. Loaded via `setupFiles`.
 *
 * Tests configure per-test behavior in beforeEach via `installMockApis(...)`
 * (see test/helpers/mocks.ts).
 *
 * Why explicit factories: importing the real CopilotAPI/XeroAPI modules pulls in
 * external SDKs (copilot-node-sdk, xero-node) that run side effects and read env
 * at import time. The factory keeps the real modules out of the graph entirely.
 *
 * Why pin mocks on globalThis: this setupFile can be evaluated more than once per
 * run under `pool: 'forks' + fileParallelism: false + isolate: false`. Pinning the
 * `vi.fn()` constructors on globalThis makes every factory invocation hand back the
 * same mock identity, so a test's beforeEach wiring is what the runtime sees.
 */

type MockConstructors = {
  CopilotAPI: ReturnType<typeof vi.fn>
  XeroAPI: ReturnType<typeof vi.fn>
}
const g = globalThis as typeof globalThis & {
  __xero_test_mocks?: MockConstructors
}
g.__xero_test_mocks ??= {
  CopilotAPI: vi.fn(),
  XeroAPI: vi.fn(),
}
const mocks = g.__xero_test_mocks

vi.mock('@/lib/copilot/CopilotAPI', () => ({
  CopilotAPI: mocks.CopilotAPI,
}))

vi.mock('@/lib/xero/XeroAPI', () => ({
  default: mocks.XeroAPI,
}))

// withRetry.ts calls `scope.addEventProcessor(...)` inside Sentry.withScope, so
// the mock must cover every method the withScope callback touches.
vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn((cb: (scope: unknown) => void) =>
    cb({
      setTag: vi.fn(),
      setExtra: vi.fn(),
      addEventProcessor: vi.fn(),
    }),
  ),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  init: vi.fn(),
}))

// Webhook flows call sleep() for pacing; tests don't exercise timing.
vi.mock('@/utils/sleep', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}))
