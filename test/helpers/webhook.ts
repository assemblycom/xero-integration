import { TEST_WEBHOOK_TOKEN } from '@test/helpers/seed'
import { testApiHandler } from 'next-test-api-route-handler'
import * as appHandler from '@/app/api/webhook/route'

/**
 * Posts a JSON payload to the Copilot webhook route through
 * `next-test-api-route-handler` and returns the Response. The caller asserts on
 * status / body — this helper never asserts.
 */
export async function postWebhook(
  payload: unknown,
  opts: { token?: string } = {},
): Promise<Response> {
  const token = opts.token ?? TEST_WEBHOOK_TOKEN
  let response: Response | undefined
  await testApiHandler({
    appHandler,
    url: `/api/webhook?token=${token}`,
    test: async ({ fetch }) => {
      response = await fetch({
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  if (!response) {
    throw new Error('postWebhook: testApiHandler did not invoke the test callback')
  }
  return response
}
