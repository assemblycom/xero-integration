import { SyncLogsService } from '@sync-logs/lib/SyncLogs.service'
import { TEST_INVOICE, TEST_PORTAL, TEST_TOKENS } from '@test/helpers/constants'
import { seedXeroConnection } from '@test/helpers/seed'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import db from '@/db'
import { SyncEntityType, SyncEventType, SyncStatus, syncLogs } from '@/db/schema/syncLogs.schema'
import type { XeroConnectionWithTokenSet } from '@/db/schema/xeroConnections.schema'
import User from '@/lib/copilot/models/User.model'

describe('SyncLogsService#createSyncLog', () => {
  setupWebhookTest()

  const service = async () => {
    const user = await User.authenticate(TEST_TOKENS.webhook)
    const connection = await seedXeroConnection()
    return new SyncLogsService(user, connection as XeroConnectionWithTokenSet)
  }

  const rows = () => db.select().from(syncLogs).where(eq(syncLogs.portalId, TEST_PORTAL.id))

  const basePayload = {
    syncDate: new Date(),
    eventType: SyncEventType.CREATED,
    entityType: SyncEntityType.INVOICE,
    copilotId: TEST_INVOICE.id,
  }

  it('writes a success log scoped to the portal and tenant', async () => {
    await (await service()).createSyncLog({ ...basePayload, status: SyncStatus.SUCCESS })

    const [row] = await rows()
    expect(row.status).toBe(SyncStatus.SUCCESS)
    expect(row.portalId).toBe(TEST_PORTAL.id)
    expect(row.tenantId).toBe(TEST_PORTAL.tenantId)
    expect(row.copilotId).toBe(TEST_INVOICE.id)
  })

  it('writes a failure log with the error message', async () => {
    await (await service()).createSyncLog({
      ...basePayload,
      status: SyncStatus.FAILED,
      errorMessage: 'Xero rejected the invoice',
    })

    const [row] = await rows()
    expect(row.status).toBe(SyncStatus.FAILED)
    expect(row.errorMessage).toBe('Xero rejected the invoice')
  })
})
