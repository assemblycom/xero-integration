import { afterEach, describe, expect, it, vi } from 'vitest'
import { withRetry } from '@/lib/copilot/withRetry'

// withRetry wraps failures in Sentry.withScope; stub it so no real client loads.
vi.mock('@sentry/nextjs', () => ({
  withScope: (cb: (scope: { addEventProcessor: () => void }) => void) =>
    cb({ addEventProcessor: vi.fn() }),
}))

// p-retry ignores non-Error throws, so build a real Error carrying a status.
const statusError = (status: number) => Object.assign(new Error('api error'), { status })

describe('withRetry', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the result and passes args through on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')

    await expect(withRetry(fn, [1, 'a'])).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledWith(1, 'a')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on a 429 up to the retry limit', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockRejectedValue(statusError(429))

    const result = withRetry(fn, []).catch((e) => e)
    // Drive the exponential backoff (1s + 2s + 4s) past its cap.
    await vi.advanceTimersByTimeAsync(30_000)
    await result

    // 1 initial attempt + 3 retries
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it('does not retry a non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(statusError(400))

    await expect(withRetry(fn, [])).rejects.toBeDefined()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
