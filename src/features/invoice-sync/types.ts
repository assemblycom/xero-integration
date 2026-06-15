import dayjs from 'dayjs'
import z from 'zod'

export const WebhookTokenSchema = z.object({
  workspaceId: z.string().min(1),
})
export type WebhookToken = z.infer<typeof WebhookTokenSchema>

export const InvoiceCreatedEventSchema = z.object({
  clientId: z.string().optional(),
  companyId: z.uuid(),
  collectionMethod: z.enum(['sendInvoice', 'chargeAutomatically']),
  createdAt: z.iso.datetime(),
  currency: z.string(),
  dueDate: z.iso.datetime().nullable().default(dayjs().format('YYYY-MM-DDTHH:mm:ss.SSSZ')), // default is for charge client option
  fileUrl: z.string(),
  id: z.string(),
  lineItems: z.array(
    z.object({
      amount: z.number(),
      description: z.string(),
      quantity: z.number(),
      priceId: z.string().optional(),
      productId: z.uuid().optional(),
    }),
  ),
  memo: z.string(),
  number: z.string(),
  sentDate: z.iso.datetime().nullable().default(dayjs().format('YYYY-MM-DDTHH:mm:ss.SSSZ')),
  status: z.enum(['open', 'draft', 'paid']),
  taxAmount: z.number(),
  taxPercentage: z.number(),
  total: z.number(),
  updatedAt: z.iso.datetime(),
})
export type InvoiceCreatedEvent = z.infer<typeof InvoiceCreatedEventSchema>

/**
 * Handles invoice modified events (e.g., updated, paid, voided, deleted)
 */
export const InvoiceModifiedEventSchema = z.object({
  id: z.string(),
})

// product.created and product.updated carry the same shape
export const ProductEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
})

export const ProductUpdatedEventSchema = ProductEventSchema
export type ProductUpdatedEvent = z.infer<typeof ProductUpdatedEventSchema>

export const ProductCreatedEventSchema = ProductEventSchema
export type ProductCreatedEvent = z.infer<typeof ProductCreatedEventSchema>

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

export const PaymentSucceededEventSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  status: z.enum(PaymentStatus),
  paymentMethod: z.string(),
  brand: z.string(),
  feeAmount: z.object({
    paidByPlatform: z.number(),
    paidByClient: z.number(),
  }),
  createdAt: z.iso.datetime(),
})
export type PaymentSucceededEvent = z.infer<typeof PaymentSucceededEventSchema>

export enum ValidWebhookEvent {
  InvoiceCreated = 'invoice.created',
  InvoiceUpdated = 'invoice.updated',
  InvoicePaid = 'invoice.paid',
  InvoiceVoided = 'invoice.voided',
  InvoiceDeleted = 'invoice.deleted',
  ProductUpdated = 'product.updated',
  ProductCreated = 'product.created',
  // Legacy: retained for historical failed_syncs records; no longer handled as a live webhook
  PriceCreated = 'price.created',
  PaymentSucceeded = 'payment.succeeded',
}

export const InvoiceCreatedWebhookSchema = z.object({
  eventType: z.literal(ValidWebhookEvent.InvoiceCreated),
  data: InvoiceCreatedEventSchema,
})
export type InvoiceCreatedWebhook = z.infer<typeof InvoiceCreatedWebhookSchema>

export const InvoiceUpdatedWebhookSchema = z.object({
  eventType: z.literal(ValidWebhookEvent.InvoiceUpdated),
  data: InvoiceCreatedEventSchema,
})
export type InvoiceUpdatedWebhook = z.infer<typeof InvoiceUpdatedWebhookSchema>

export const InvoicePaidWebhookSchema = z.object({
  eventType: z.literal(ValidWebhookEvent.InvoicePaid),
  data: InvoiceModifiedEventSchema,
})
export type InvoicePaidWebhook = z.infer<typeof InvoicePaidWebhookSchema>

export const InvoiceVoidedWebhookSchema = z.object({
  eventType: z.literal(ValidWebhookEvent.InvoiceVoided),
  data: InvoiceModifiedEventSchema,
})
export type InvoiceVoidedWebhook = z.infer<typeof InvoiceVoidedWebhookSchema>

export const InvoiceDeletedWebhookSchema = z.object({
  eventType: z.literal(ValidWebhookEvent.InvoiceDeleted),
  data: InvoiceModifiedEventSchema,
})
export type InvoiceDeletedWebhook = z.infer<typeof InvoiceDeletedWebhookSchema>

export const ProductUpdatedWebhookSchema = z.object({
  eventType: z.literal(ValidWebhookEvent.ProductUpdated),
  data: ProductUpdatedEventSchema,
})
export type ProductUpdatedWebhook = z.infer<typeof ProductUpdatedWebhookSchema>

export const ProductCreatedWebhookSchema = z.object({
  eventType: z.literal(ValidWebhookEvent.ProductCreated),
  data: ProductCreatedEventSchema,
})
export type ProductCreatedWebhook = z.infer<typeof ProductCreatedWebhookSchema>

export const PaymentSucceededWebhookSchema = z.object({
  eventType: z.literal(ValidWebhookEvent.PaymentSucceeded),
  data: PaymentSucceededEventSchema,
})

export const WebhookEventSchema = z.discriminatedUnion('eventType', [
  InvoiceCreatedWebhookSchema,
  InvoiceUpdatedWebhookSchema,
  InvoicePaidWebhookSchema,
  InvoiceVoidedWebhookSchema,
  InvoiceDeletedWebhookSchema,
  ProductUpdatedWebhookSchema,
  ProductCreatedWebhookSchema,
  PaymentSucceededWebhookSchema,
])
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
