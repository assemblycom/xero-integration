import { ValidWebhookEvent } from '@invoice-sync/types'
import { integer, jsonb, pgEnum, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/db.helpers'

export const failedSyncTypeEnum = pgEnum('failed_syncs_type', [
  ValidWebhookEvent.InvoiceCreated,
  ValidWebhookEvent.InvoiceUpdated,
  ValidWebhookEvent.InvoicePaid,
  ValidWebhookEvent.InvoiceVoided,
  ValidWebhookEvent.InvoiceDeleted,
  ValidWebhookEvent.ProductUpdated,
  // Legacy: no longer emitted, kept so historical failed_syncs rows stay valid
  ValidWebhookEvent.PriceCreated,
  ValidWebhookEvent.ProductCreated,
  ValidWebhookEvent.PaymentSucceeded,
])

export const failedSyncs = pgTable(
  'failed_syncs',
  {
    id: uuid().primaryKey().notNull().defaultRandom(),

    // Workspace ID / Portal ID in Copilot
    portalId: varchar({ length: 64 }).notNull(),

    // Active Tenant ID (most recently connected Xero organization)
    tenantId: uuid().notNull(),

    // Type of sync
    type: failedSyncTypeEnum().notNull(),

    // Token used for sync
    token: varchar({ length: 1024 }).notNull(),

    // ID of the resource (price / invoice)
    resourceId: varchar({ length: 64 }).notNull(),

    // Number of attempts to sync item
    attempts: integer().notNull().default(0),

    // Payload of the failed sync webhook
    payload: jsonb().notNull(),

    ...timestamps,
  },

  // Only allow one failed sync record per failed resource
  (t) => [uniqueIndex('uq_failed_syncs_resource_id').on(t.resourceId)],
)
