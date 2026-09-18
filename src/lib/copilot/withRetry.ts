import * as Sentry from '@sentry/nextjs'

import pRetry from 'p-retry'
import type { StatusableError } from '@/errors/BaseServerError'
import logger from '@/lib//logger'

export const withRetry = async <Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  args: Args,
): Promise<R> => {
  let isEventProcessorRegistered = false

  return await pRetry(
    async () => {
      try {
        return await fn(...args)
      } catch (error) {
        Sentry.withScope((scope) => {
          if (isEventProcessorRegistered) return
          isEventProcessorRegistered = true
          scope.addEventProcessor((event) => {
            if (
              event.level === 'error' &&
              event.message &&
              event.message.includes('An error occurred during retry')
            ) {
              return null // Discard the event as it occured during retry
            }
            return event
          })
        })
        // Rethrow the error so pRetry can retry
        throw error
      }
    },

    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 5000,
      factor: 2, // Exponential factor for timeout delay. Tweak this if issues still persist

      onFailedAttempt: (error: { error: unknown; attemptNumber: number; retriesLeft: number }) => {
        if (
          (error.error as StatusableError).status !== 429 &&
          (error.error as StatusableError).status !== 500
        ) {
          return
        }
        logger.warn(
          `CopilotAPI#withRetry | Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left. Error:`,
          error,
        )
      },
      shouldRetry: (context: { error: unknown }) => {
        // p-retry passes a context object; the error is on context.error.
        // Typecasting because Copilot doesn't export an error class
        const err = context.error as StatusableError
        // Retry only if statusCode indicates a ratelimit or Internal Server Error
        return err.status === 429 || err.status === 500
      },
    },
  )
}
