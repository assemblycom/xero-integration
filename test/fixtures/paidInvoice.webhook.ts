import { type InvoicePaidWebhookSchema, ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_INVOICE } from '@test/helpers/constants'
import type { z } from 'zod'

type PaidInvoiceWebhookInput = z.input<typeof InvoicePaidWebhookSchema>
type PaidInvoiceData = PaidInvoiceWebhookInput['data']

// Builds an invoice.paid webhook payload. The payload is just { id }; pass
// `dataOverrides` to vary the invoice id.
export function buildPaidInvoiceWebhook(
  dataOverrides: Partial<PaidInvoiceData> = {},
): PaidInvoiceWebhookInput {
  return {
    eventType: ValidWebhookEvent.InvoicePaid,
    data: {
      id: TEST_INVOICE.id,
      ...dataOverrides,
    },
  }
}
