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

// The Copilot client an invoice is billed to (client-billed happy path) and its
// company. companyId must be a valid v4 uuid (InvoiceCreatedEventSchema.companyId).
export const TEST_CLIENT = {
  id: '55555555-5555-4555-8555-555555555555',
  email: 'client@example.test',
  givenName: 'Test',
  familyName: 'Client',
}
export const TEST_COMPANY = { id: '66666666-6666-4666-8666-666666666666' }

// The Copilot invoice and the Xero entities it maps to. Xero ids are v4 uuids
// because synced_invoices.xeroInvoiceId / salesAccountId and synced_contacts.contactId
// are uuid columns.
export const TEST_INVOICE = { id: 'test-invoice-00000001', number: 'INV-0001' }
export const TEST_XERO_CONTACT = { id: '77777777-7777-4777-8777-777777777777' }
export const TEST_XERO_INVOICE = { id: '88888888-8888-4888-8888-888888888888' }
export const TEST_SALES_ACCOUNT = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
