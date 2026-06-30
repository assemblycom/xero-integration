import { getTableName, sql } from 'drizzle-orm'
import db from '@/db'
import { schema } from '@/db/schema'

// Derived from the schema barrel so new tables are truncated automatically.
const ALL_TABLES = Object.values(schema)

/**
 * Wipes every table that integration tests can touch. Call in `beforeEach` —
 * the testcontainer Postgres is shared across the full integration run, so
 * cross-test contamination is a real risk.
 */
export async function truncateAllTestTables() {
  const tableList = sql.join(
    ALL_TABLES.map((table) => sql.identifier(getTableName(table))),
    sql`, `,
  )
  await db.execute(sql`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)
}
