import 'server-only'

import { z } from 'zod'

// Env modes where the SDK authorizes with the workspace-scoped key (no token).
// Mirrors the allow-list in @assembly-js/node-sdk/dist/api/init.js (assemblyApi);
// re-check it when bumping the SDK, as it is not exported.
const ASSEMBLY_KEYLESS_ENV_MODES = ['local', '__SECRET_STAGING__'] as const

const ServerEnvSchema = z.object({
  COPILOT_API_KEY: z.string().min(1),
  DATABASE_URL: z.url(),
  XERO_CLIENT_ID: z.string().min(1),
  XERO_CLIENT_SECRET: z.string().min(1),
  XERO_CALLBACK_URL: z.url(),
  XERO_SCOPES: z.string().min(1),
  VERCEL_ENV: z.string().optional(),
  // Effective SDK env mode; merged from ASSEMBLY_ENV/COPILOT_ENV at parse below.
  ASSEMBLY_ENV: z.enum(ASSEMBLY_KEYLESS_ENV_MODES, {
    error: `ASSEMBLY_ENV (or COPILOT_ENV) must be one of: ${ASSEMBLY_KEYLESS_ENV_MODES.join(', ')}. Set it in every runtime (Vercel).`,
  }),

  // Flags
  FLAG_DISABLE_NOTIFICATION_EMAILS: z.coerce.boolean().default(false),
  FLAG_ENABLE_DELETE_SYNC: z.coerce.boolean().default(false),
})

// Collapse the precedence once here, matching the SDK's getEnvMode
// (ASSEMBLY_ENV ?? COPILOT_ENV), so our check and the SDK never disagree.
const env = ServerEnvSchema.parse({
  ...process.env,
  ASSEMBLY_ENV: process.env.ASSEMBLY_ENV ?? process.env.COPILOT_ENV,
})
export default env
