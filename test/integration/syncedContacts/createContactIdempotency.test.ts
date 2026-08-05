import AuthService from '@auth/lib/Auth.service'
import SyncedContactsService from '@invoice-sync/lib/SyncedContacts.service'
import { TEST_CLIENT, TEST_COMPANY, TEST_TOKENS, TEST_XERO_CONTACT } from '@test/helpers/constants'
import { createMockXeroAPI } from '@test/helpers/mocks'
import { seedConnectedPortal, seedSyncedContact } from '@test/helpers/seed'
import { setupWebhookTest } from '@test/helpers/webhookTestSetup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import db from '@/db'
import { syncedContacts } from '@/db/schema/syncedContacts.schema'
import { SyncEntityType, syncLogs } from '@/db/schema/syncLogs.schema'
import User from '@/lib/copilot/models/User.model'

// A concurrent sync already stored this mapping; our insert collides on it.
const WINNER_CONTACT_ID = TEST_XERO_CONTACT.id
// The losing sync still creates its own (orphan) Xero contact before inserting.
const ORPHAN_CONTACT_ID = '99999999-9999-4999-8999-999999999999'

const CLIENT = {
  id: TEST_CLIENT.id,
  givenName: TEST_CLIENT.givenName,
  familyName: TEST_CLIENT.familyName,
  email: TEST_CLIENT.email,
  companyIds: [TEST_COMPANY.id],
  status: 'active',
  avatarImageUrl: null,
  fallbackColor: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('SyncedContactsService.createContact — concurrent-safe get-or-create', () => {
  setupWebhookTest(() => ({
    xero: createMockXeroAPI({
      createContact: vi.fn().mockResolvedValue({
        contactID: ORPHAN_CONTACT_ID,
        name: `${TEST_CLIENT.givenName} ${TEST_CLIENT.familyName}`,
        emailAddress: TEST_CLIENT.email,
      }),
    }),
  }))

  it('returns the existing mapping instead of failing on a duplicate insert', async () => {
    await seedConnectedPortal()
    await seedSyncedContact({ contactId: WINNER_CONTACT_ID })

    const user = await User.authenticate(TEST_TOKENS.webhook)
    const connection = await new AuthService(user).authorizeXeroForCopilotWorkspace()
    const service = new SyncedContactsService(user, connection)

    const contact = await service.createContact(CLIENT)

    // Returns the stored winner, not the orphan just created in Xero.
    expect(contact.contactID).toBe(WINNER_CONTACT_ID)

    // The unique mapping is untouched — no duplicate row.
    const rows = await db.select().from(syncedContacts)
    expect(rows).toHaveLength(1)
    expect(rows[0].contactId).toBe(WINNER_CONTACT_ID)

    // A conflict is a no-op, not a create — no customer sync log is written.
    const customerLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.entityType, SyncEntityType.CUSTOMER))
    expect(customerLogs).toHaveLength(0)
  })
})
