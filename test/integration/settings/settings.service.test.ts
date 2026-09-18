import SettingsService from '@settings/lib/Settings.service'
import { TEST_PORTAL, TEST_TOKENS } from '@test/helpers/constants'
import { seedSettings, seedXeroConnection } from '@test/helpers/seed'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { settings } from '@/db/schema/settings.schema'
import type { XeroConnectionWithTokenSet } from '@/db/schema/xeroConnections.schema'
import User from '@/lib/copilot/models/User.model'

const OTHER_TENANT = '99999999-9999-4999-8999-999999999999'

describe('SettingsService', () => {
  setupWebhookTest()

  // Builds a service bound to the given tenant (defaults to the seeded portal's tenant).
  const service = async (tenantId: string = TEST_PORTAL.tenantId) => {
    const user = await User.authenticate(TEST_TOKENS.webhook)
    const connection = await seedXeroConnection()
    return new SettingsService(user, {
      ...connection,
      tenantId,
    } as XeroConnectionWithTokenSet)
  }

  const settingsRows = () => db.select().from(settings).where(eq(settings.portalId, TEST_PORTAL.id))

  it('getSettings returns undefined when none exist', async () => {
    expect(await (await service()).getSettings()).toBeUndefined()
  })

  it('getOrCreateSettings creates defaults, then returns the same row', async () => {
    const svc = await service()

    const created = await svc.getOrCreateSettings()
    expect(created.isSyncEnabled).toBe(false)
    expect(created.syncProductsAutomatically).toBe(false)

    const again = await svc.getOrCreateSettings()
    expect(again).toEqual(created)
    expect(await settingsRows()).toHaveLength(1)
  })

  it('updateSettings persists a changed toggle', async () => {
    await seedSettings({ isSyncEnabled: true })

    const updated = await (await service()).updateSettings({ isSyncEnabled: false })

    expect(updated.isSyncEnabled).toBe(false)
    const [row] = await settingsRows()
    expect(row.isSyncEnabled).toBe(false)
  })

  it('is scoped to the connection tenant', async () => {
    await seedSettings({ isSyncEnabled: true }) // TEST_PORTAL.tenantId

    const otherTenantSvc = await service(OTHER_TENANT)
    expect(await otherTenantSvc.getSettings()).toBeUndefined()

    await otherTenantSvc.updateSettings({ isSyncEnabled: false })

    // The original tenant's row is untouched.
    const [row] = await db
      .select()
      .from(settings)
      .where(
        and(eq(settings.portalId, TEST_PORTAL.id), eq(settings.tenantId, TEST_PORTAL.tenantId)),
      )
    expect(row.isSyncEnabled).toBe(true)
  })
})
