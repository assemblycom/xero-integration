import { pgEnum, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { createInsertSchema } from 'drizzle-zod'
import type z from 'zod'
import { timestamps } from '@/db/db.helpers'

export const syncedInvoiceStatusEnum = pgEnum('synced_invoices_status', [
  'pending',
  'failed',
  'success',
])

export const syncedInvoices = pgTable(
  'synced_invoices',
  {
    id: uuid().primaryKey().notNull().defaultRandom(),

    // Workspace ID / Portal ID in Copilot
    portalId: varchar({ length: 64 }).notNull(),

    // Active Tenant ID (most recently connected Xero organization)
    tenantId: uuid().notNull(),

    // Invoice ID for Copilot invoice
    copilotInvoiceId: varchar({ length: 64 }).notNull(),

    // Invoice ID for synced Xero invoice
    xeroInvoiceId: uuid(),

    // Xero accountID of the sales account this invoice's lines used; payment re-resolves it
    // so it posts to the same account. Null for invoices synced before this column.
    salesAccountId: uuid(),

    // Status for sync
    status: syncedInvoiceStatusEnum().default('pending').notNull(),

    ...timestamps,
  },
  (t) => [
    // One invoice for a portal should have ONLY ONE invoice sync on Xero
    uniqueIndex('uq_synced_invoices_portal_id_copilot_invoice_id').on(
      t.portalId,
      t.copilotInvoiceId,
    ),
  ],
)

export const SyncedInvoiceCreatePayloadSchema = createInsertSchema(syncedInvoices)
export type SyncedInvoiceCreatePayload = z.infer<typeof SyncedInvoiceCreatePayloadSchema>
