// Shared identifiers for integration tests. Kept separate from seed.ts so files
// that only need an id don't pull in the DB-heavy seed module.

// The seeded workspace. tenantId/internalUserId are valid v4 uuids (version
// nibble 4, variant nibble 8) so z.uuid() accepts them.
export const TEST_PORTAL = {
  id: 'test-portal-00000001',
  tenantId: '11111111-1111-4111-8111-111111111111',
  internalUserId: '22222222-2222-4222-8222-222222222222',
}

// Copilot webhook token + Xero OAuth token stubs.
export const TEST_TOKENS = {
  webhook: 'test-token-xyz',
  access: 'test-access-token',
  refresh: 'test-refresh-token',
}

// A Copilot product and the Xero item it maps to. `other` is a second item id
// for asserting a pre-existing mapping is left untouched.
export const TEST_PRODUCT = { id: '33333333-3333-4333-8333-333333333333' }
export const TEST_XERO_ITEM = {
  id: '44444444-4444-4444-8444-444444444444',
  other: '99999999-9999-4999-8999-999999999999',
}
