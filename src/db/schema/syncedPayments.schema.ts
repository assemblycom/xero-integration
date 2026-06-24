import { sql } from 'drizzle-orm'
import { index, pgEnum, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import type z from 'zod'
import { timestamps } from '@/db/db.helpers'

export enum PaymentUserType {
  PAYMENT = 'payment',
  EXPENSE = 'expense',
}

export const userType = pgEnum('synced_payments_payment_type', PaymentUserType)

export const syncedPayments = pgTable(
  'synced_payments',
  {
    id: uuid().primaryKey().notNull().defaultRandom(),

    // Workspace ID / Portal ID in Copilot
    portalId: varchar({ length: 64 }).notNull(),

    // Active Tenant ID for Xero
    tenantId: uuid().notNull(),

    // Copilot Invoice ID
    copilotInvoiceId: varchar({ length: 64 }).notNull(),

    // Synced Xero Invoice ID (payment is always linked to an invoice)
    xeroInvoiceId: uuid().notNull(),

    // Copilot Payment ID
    copilotPaymentId: varchar({ length: 64 }),

    // Synced Xero Payment ID
    xeroPaymentId: uuid().notNull(),

    // Payment type
    type: userType().default(PaymentUserType.PAYMENT),

    ...timestamps,
  },
  (t) => [
    index('uq_synced_payments_portal_id_tenant_id_copilot_invoice_id').on(
      t.portalId,
      t.tenantId,
      t.copilotInvoiceId,
    ),
    uniqueIndex('uq_synced_payments_xero_payment_id').on(t.xeroPaymentId),
    // One expense per Copilot payment. Partial so NULL payment rows are skipped.
    uniqueIndex('uq_synced_payments_portal_tenant_copilot_payment_id')
      .on(t.portalId, t.tenantId, t.copilotPaymentId)
      .where(sql`${t.copilotPaymentId} IS NOT NULL`),
  ],
)

export const SyncedPaymentSchema = createSelectSchema(syncedPayments)
export type SyncedPayment = z.infer<typeof SyncedPaymentSchema>
