import { type InvoiceCreatedWebhookSchema, ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_CLIENT, TEST_COMPANY, TEST_INVOICE } from '@test/helpers/constants'
import type { z } from 'zod'

type InvoiceWebhookInput = z.input<typeof InvoiceCreatedWebhookSchema>
type InvoiceData = InvoiceWebhookInput['data']

// Builds an invoice.created webhook payload for the client-billed happy path.
// Pass `dataOverrides` to vary a single case (status, collectionMethod,
// lineItems, taxAmount, etc.) without repeating the whole object.
export function buildInvoiceCreatedWebhook(
  dataOverrides: Partial<InvoiceData> = {},
): InvoiceWebhookInput {
  return {
    eventType: ValidWebhookEvent.InvoiceCreated,
    data: {
      clientId: TEST_CLIENT.id,
      companyId: TEST_COMPANY.id,
      collectionMethod: 'sendInvoice',
      createdAt: '2026-07-02T00:00:00.000Z',
      currency: 'USD',
      dueDate: '2026-07-16T00:00:00.000Z',
      fileUrl: 'https://example.test/invoice.pdf',
      id: TEST_INVOICE.id,
      lineItems: [{ amount: 10000, description: 'Consulting', quantity: 1 }],
      memo: 'Thanks for your business',
      number: TEST_INVOICE.number,
      sentDate: '2026-07-02T00:00:00.000Z',
      status: 'open',
      taxAmount: 825,
      taxPercentage: 8.25,
      total: 10825,
      updatedAt: '2026-07-02T00:00:00.000Z',
      ...dataOverrides,
    },
  }
}
