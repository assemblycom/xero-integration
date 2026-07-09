import { type InvoiceVoidedWebhookSchema, ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_INVOICE } from '@test/helpers/constants'
import type { z } from 'zod'

type VoidedInvoiceWebhookInput = z.input<typeof InvoiceVoidedWebhookSchema>
type VoidedInvoiceData = VoidedInvoiceWebhookInput['data']

// Builds an invoice.voided webhook payload. The payload is just { id }; pass
// `dataOverrides` to vary the invoice id.
export function buildVoidedInvoiceWebhook(
  dataOverrides: Partial<VoidedInvoiceData> = {},
): VoidedInvoiceWebhookInput {
  return {
    eventType: ValidWebhookEvent.InvoiceVoided,
    data: {
      id: TEST_INVOICE.id,
      ...dataOverrides,
    },
  }
}
