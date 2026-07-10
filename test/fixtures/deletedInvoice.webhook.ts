import { type InvoiceDeletedWebhookSchema, ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_INVOICE } from '@test/helpers/constants'
import type { z } from 'zod'

type DeletedInvoiceWebhookInput = z.input<typeof InvoiceDeletedWebhookSchema>
type DeletedInvoiceData = DeletedInvoiceWebhookInput['data']

// Builds an invoice.deleted webhook payload. The payload is just { id }; pass
// `dataOverrides` to vary the invoice id.
export function buildDeletedInvoiceWebhook(
  dataOverrides: Partial<DeletedInvoiceData> = {},
): DeletedInvoiceWebhookInput {
  return {
    eventType: ValidWebhookEvent.InvoiceDeleted,
    data: {
      id: TEST_INVOICE.id,
      ...dataOverrides,
    },
  }
}
