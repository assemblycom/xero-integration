import {
  PaymentStatus,
  type PaymentSucceededWebhookSchema,
  ValidWebhookEvent,
} from '@invoice-sync/types'
import { TEST_FEE, TEST_INVOICE, TEST_PAYMENT } from '@test/helpers/constants'
import type { z } from 'zod'

type PaymentSucceededWebhookInput = z.input<typeof PaymentSucceededWebhookSchema>
type PaymentSucceededData = PaymentSucceededWebhookInput['data']

// Builds a payment.succeeded payload. Fee is TEST_FEE (cents). Pass `dataOverrides` to vary.
export function buildPaymentSucceededWebhook(
  dataOverrides: Partial<PaymentSucceededData> = {},
): PaymentSucceededWebhookInput {
  return {
    eventType: ValidWebhookEvent.PaymentSucceeded,
    data: {
      id: TEST_PAYMENT.id,
      invoiceId: TEST_INVOICE.id,
      status: PaymentStatus.SUCCEEDED,
      paymentMethod: 'card',
      brand: 'visa',
      feeAmount: { paidByPlatform: TEST_FEE.cents, paidByClient: 0 },
      createdAt: '2026-01-01T00:00:00.000Z',
      ...dataOverrides,
    },
  }
}
