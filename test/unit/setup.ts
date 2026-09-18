import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// Unit tests have no globalSetup, but some modules validate env at import time.
// Load the same non-secret stubs the integration harness uses.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env.test'), override: true })

// .env.test omits DATABASE_URL (the integration container sets it). Unit tests
// never open a connection, so a dummy value just satisfies env validation.
process.env.DATABASE_URL ??= 'postgresql://unit:unit@localhost:5432/unit_test'
