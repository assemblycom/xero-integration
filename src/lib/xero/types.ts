import { type Contact, Invoice, TaxRate } from 'xero-node'
import z from 'zod'
import type XeroAPI from '@/lib/xero/XeroAPI'

/**
 *  @deprecated Use `TokenSet` from `xero-node` instead
 */
export type XeroTokenSet = Awaited<ReturnType<typeof XeroAPI.prototype.handleApiCallback>>

/**
 * Schema for `Invoice` entity in Xero.
 * See "Elements of LineItems"
 * Ref: https://developer.xero.com/documentation/api/accounting/invoices#post-invoices
 *
 */
export const LineItemSchema = z
  .object({
    description: z.string().min(1),
    quantity: z.number().min(1).positive(),
    unitAmount: z.number().positive(),
    taxAmount: z.number().nonnegative(),
    taxType: z.string().optional(),
    lineItemID: z.uuid().optional(),
    itemCode: z.string().optional(),
    // Unique code to identify Xero item
    accountCode: z.string().min(1, 'Account code is required'),
    accountId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const both = data.lineItemID && data.itemCode
    const neither = !data.lineItemID && !data.itemCode

    if (!(both || neither)) {
      if (!data.lineItemID) {
        ctx.addIssue({
          code: 'custom',
          path: ['lineItemID'],
          message: 'Provide lineItemID when itemCode is set.',
        })
      }
      if (!data.itemCode) {
        ctx.addIssue({
          code: 'custom',
          path: ['itemCode'],
          message: 'Provide itemCode when lineItemID is set.',
        })
      }
    }
  })
export type LineItem = z.infer<typeof LineItemSchema>

export const ContactSchema = z.object({
  contactID: z.uuid().optional(),
  contactName: z.string().optional(),
})

export const CreateInvoicePayloadSchema = z.object({
  // ACCREC – Unique alpha numeric code identifying invoice (when missing will auto-generate from your Organisation Invoice Settings) (max length = 255)
  invoiceNumber: z.string(),
  // Type of Invoice (see enum details)
  type: z.enum(Invoice.TypeEnum),
  // Predefined contact
  contact: ContactSchema,
  // Date invoice was issued – YYYY-MM-DD. If the Date element is not specified it will default to the current date based on the timezone setting of the organisation
  date: z.iso.date(),
  // Date invoice is due – YYYY-MM-DD
  dueDate: z.iso.date(),
  // Line amounts are exclusive of tax by default if you don’t specify this. Not needed
  // lineAmountTypes: z.enum(LineAmountTypes),
  // Line items
  lineItems: z.array(LineItemSchema),
  // Status (See enum)
  status: z.enum(Invoice.StatusEnum),
})
export type CreateInvoicePayload = z.infer<typeof CreateInvoicePayloadSchema>

export type ValidContact = Contact & { contactID: string }

export const ContactCreatePayloadSchema = z.object({
  name: z.string().min(1),
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  emailAddress: z.email().optional(),
})
export type ContactCreatePayload = z.infer<typeof ContactCreatePayloadSchema>

export const TaxRateCreatePayloadSchema = z.object({
  name: z.string(),
  taxComponents: z.array(
    z.object({
      name: z.string(),
      rate: z.number(),
      isCompound: z.boolean(),
      isNonRecoverable: z.boolean(),
    }),
  ),
  reportTaxType: z.enum(TaxRate.ReportTaxTypeEnum).optional(),
  status: z.enum(TaxRate.StatusEnum),
})
export type TaxRateCreatePayload = z.infer<typeof TaxRateCreatePayloadSchema>

export const ItemUpdatePayloadSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
})
export type ItemUpdatePayload = z.infer<typeof ItemUpdatePayloadSchema>

export type ClientXeroItem = {
  itemID: string
  code: string
  name: string
  amount: number
}
