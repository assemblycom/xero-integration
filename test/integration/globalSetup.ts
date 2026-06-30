import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

/**
 * Vitest globalSetup for integration tests.
 *
 * - Start an ephemeral Postgres container via testcontainers
 * - Set process.env.DATABASE_URL before any test worker imports @/config
 * - Apply all Drizzle migrations from src/db/migrations to the fresh DB
 * - Stop the container on teardown
 *
 * Vitest spawns worker processes AFTER globalSetup resolves, so process.env set
 * here is inherited by workers. Combined with `pool: 'forks'` and
 * `fileParallelism: false`, this gives us one container shared across all files.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../src/db/migrations')
const ENV_TEST_FILE = path.resolve(__dirname, '../../.env.test')

let container: StartedPostgreSqlContainer | undefined

export default async function globalSetup() {
  // Load .env.test first. `override: true` keeps a developer's local `.env` from
  // leaking into test runs. DATABASE_URL is set below from the container URI.
  dotenv.config({ path: ENV_TEST_FILE, override: true })

  console.info('[globalSetup] Starting Postgres test container...')

  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_pass')
    .start()

  const url = container.getConnectionUri()
  process.env.DATABASE_URL = url

  console.info('[globalSetup] Running Drizzle migrations...')
  const migrationClient = postgres(url, { max: 1, prepare: false })
  const migrationDb = drizzle(migrationClient, { casing: 'snake_case' })
  try {
    await migrate(migrationDb, { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await migrationClient.end()
  }

  console.info(`[globalSetup] Ready: ${url}`)

  return async () => {
    console.info('[globalSetup] Stopping Postgres test container...')
    await container?.stop()
  }
}
