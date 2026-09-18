import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import APIError from '@/errors/APIError'
import CopilotInvalidTokenError from '@/lib/copilot/errors/CopilotInvalidTokenError'
import CopilotNoTokenError from '@/lib/copilot/errors/CopilotNoTokenError'
import { withErrorHandler } from '@/utils/withErrorHandler'

// The handler ignores req/params, so a bare cast is enough.
const run = (throwing: () => unknown) =>
  withErrorHandler(() => {
    throwing()
    return Promise.resolve(NextResponse.json({ ok: true }))
  })({} as NextRequest, undefined)

describe('withErrorHandler', () => {
  it('passes a successful response through', async () => {
    const res = await run(() => undefined)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('maps a ZodError to 422', async () => {
    const res = await run(() => z.number().parse('nope'))
    expect(res.status).toBe(422)
  })

  it('maps missing and invalid Copilot tokens to 401', async () => {
    const noToken = await run(() => {
      throw new CopilotNoTokenError()
    })
    expect(noToken.status).toBe(401)

    const invalid = await run(() => {
      throw new CopilotInvalidTokenError()
    })
    expect(invalid.status).toBe(401)
  })

  it('uses the status and message from an APIError', async () => {
    const res = await run(() => {
      throw new APIError('teapot', 418)
    })
    expect(res.status).toBe(418)
    expect(await res.json()).toEqual({ error: 'teapot' })
  })

  it('maps a generic error to 500 with its message', async () => {
    const res = await run(() => {
      throw new Error('boom')
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'boom' })
  })
})
