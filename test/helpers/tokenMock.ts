import crypto from 'node:crypto'
import { TEST_PORTAL } from '@test/helpers/constants'
import env from '@/config/server.env'

// Payload the Assembly SDK mock returns. Decodes a real encoded token to its
// own workspaceId (like the SDK); falls back to TEST_PORTAL for stub tokens.
export function decodeTokenPayloadOrDefault(token?: string) {
  if (token) {
    try {
      const key = crypto.createHmac('sha256', env.COPILOT_API_KEY).digest('hex').slice(0, 32)
      const buf = Buffer.from(token, 'hex')
      const decipher = crypto.createDecipheriv(
        'aes-128-cbc',
        Buffer.from(key, 'hex'),
        buf.subarray(0, 16),
      )
      const json = Buffer.concat([decipher.update(buf.subarray(16)), decipher.final()]).toString(
        'utf-8',
      )
      const parsed = JSON.parse(json) as { workspaceId?: unknown }
      if (typeof parsed.workspaceId === 'string') return parsed
    } catch {
      // Not a real encoded token — fall back to the seeded default below.
    }
  }
  return { workspaceId: TEST_PORTAL.id, internalUserId: TEST_PORTAL.internalUserId }
}
