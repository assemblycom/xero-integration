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
// for asserting a pre-existing mapping is left untouched. `code` is the Xero
// item code product.updated resends on every update.
export const TEST_PRODUCT = { id: '33333333-3333-4333-8333-333333333333' }
export const TEST_XERO_ITEM = {
  id: '44444444-4444-4444-8444-444444444444',
  other: '99999999-9999-4999-8999-999999999999',
  code: 'TEST-ITEM-CODE',
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
// `total` is the dollar total invoice.paid passes to markInvoicePaid; a non-round
// value catches an accidental cents/dollars conversion or rounding bug.
export const TEST_XERO_INVOICE = { id: '88888888-8888-4888-8888-888888888888', total: 108.25 }
export const TEST_SALES_ACCOUNT = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
// Xero payment id. Valid v4 uuid because synced_payments.xeroPaymentId is a uuid column.
export const TEST_XERO_PAYMENT = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }

// payment.succeeded: the Copilot payment id and the Xero SPEND bank-txn id (v4 uuid).
export const TEST_PAYMENT = { id: 'test-payment-00000001' }
export const TEST_XERO_BANK_TXN = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }

// Absorbed platform fee. `cents` is the single source; a non-round value catches
// a /100 bug. dollars/dollarsString derive it for the line item and sync-log columns.
const feeInCents = 237
export const TEST_FEE = {
  cents: feeInCents,
  dollars: feeInCents / 100,
  dollarsString: String(feeInCents / 100),
}

// Absorbed-fee asset + expense accounts. Only id is used; region codes asserted inline.
export const TEST_ASSET_ACCOUNT = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }
export const TEST_EXPENSE_ACCOUNT = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }
