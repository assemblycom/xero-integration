import 'server-only'

import { z } from 'zod'

// Env modes where the SDK authorizes with the workspace-scoped key (no token).
// Mirrors the allow-list in @assembly-js/node-sdk/dist/api/init.js (assemblyApi);
// re-check it when bumping the SDK, as it is not exported.
const ASSEMBLY_KEYLESS_ENV_MODES = ['local', '__SECRET_STAGING__']

const ServerEnvSchema = z
  .object({
    COPILOT_API_KEY: z.string().min(1),
    DATABASE_URL: z.url(),
    XERO_CLIENT_ID: z.string().min(1),
    XERO_CLIENT_SECRET: z.string().min(1),
    XERO_CALLBACK_URL: z.url(),
    XERO_SCOPES: z.string().min(1),
    VERCEL_ENV: z.string().optional(),
    ASSEMBLY_ENV: z.string().optional(),
    COPILOT_ENV: z.string().optional(),

    // Flags
    FLAG_DISABLE_NOTIFICATION_EMAILS: z.coerce.boolean().default(false),
    FLAG_ENABLE_DELETE_SYNC: z.coerce.boolean().default(false),

    // CRON
    CRON_SECRET: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const envMode = val.ASSEMBLY_ENV ?? val.COPILOT_ENV
    if (!envMode || !ASSEMBLY_KEYLESS_ENV_MODES.includes(envMode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['COPILOT_ENV'],
        message: `COPILOT_ENV (or ASSEMBLY_ENV) must be one of: ${ASSEMBLY_KEYLESS_ENV_MODES.join(', ')}. Set it in every runtime (Vercel).`,
      })
    }
  })

const env = ServerEnvSchema.parse(process.env)
export default env
