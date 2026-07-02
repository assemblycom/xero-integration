import { TEST_PORTAL } from '@test/helpers/constants'
import { seedConnectedPortal } from '@test/helpers/seed'
import { truncateAllTestTables } from '@test/helpers/testDb'
import { beforeEach, describe, expect, it } from 'vitest'
import db from '@/db'
import { settings } from '@/db/schema/settings.schema'
import { xeroConnections } from '@/db/schema/xeroConnections.schema'

/**
 * Smoke test for the integration harness itself: proves the testcontainer
 * Postgres boots, migrations applied, the @/db connection resolves the dynamic
 * DATABASE_URL, and the seed/truncate helpers work. Delete once real flow tests
 * exist — it only exercises the harness, not application code.
 */
describe('integration harness', () => {
  beforeEach(async () => {
    await truncateAllTestTables()
  })

  it('migrates the schema so seeded tables are queryable', async () => {
    const rows = await db.select().from(xeroConnections)
    expect(rows).toEqual([])
  })

  it('seeds a connected portal and reads it back', async () => {
    await seedConnectedPortal()

    const connections = await db.select().from(xeroConnections)
    expect(connections).toHaveLength(1)
    expect(connections[0]).toMatchObject({ portalId: TEST_PORTAL.id, status: true })

    const settingRows = await db.select().from(settings)
    expect(settingRows).toHaveLength(1)
    expect(settingRows[0]).toMatchObject({ portalId: TEST_PORTAL.id, isSyncEnabled: true })
  })

  it('truncates between tests', async () => {
    const connections = await db.select().from(xeroConnections)
    expect(connections).toEqual([])
  })
})
