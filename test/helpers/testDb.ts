import { getTableName, sql } from 'drizzle-orm'
import db from '@/db'
import { schema } from '@/db/schema'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { syncLogs } from '@/db/schema/syncLogs.schema'

// Derive the table list from the schema so new tables are truncated
// automatically. `schema/index.ts` omits syncLogs + failedSyncs, so add them
// explicitly until they're included there.
const ALL_TABLES = [...Object.values(schema), syncLogs, failedSyncs]

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
