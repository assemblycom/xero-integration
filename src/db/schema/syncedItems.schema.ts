import { pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import type z from 'zod'
import { timestamps } from '@/db/db.helpers'

export const syncedItems = pgTable(
  'synced_items',
  {
    id: uuid().primaryKey().notNull().defaultRandom(),

    // Workspace ID / Portal ID in Copilot
    portalId: varchar({ length: 64 }).notNull(),

    // Active Tenant ID (most recently connected Xero organization)
    tenantId: uuid().notNull(),

    // Product ID for Copilot
    productId: varchar({ length: 64 }).notNull(),

    // Item ID for synced Item in Xero
    itemId: uuid().notNull(),

    ...timestamps,
  },
  (t) => [
    // One product for a portal/tenant should have ONLY ONE synced item in Xero
    uniqueIndex('uq_synced_items_portal_id_tenant_id_product_id').on(
      t.portalId,
      t.tenantId,
      t.productId,
    ),
  ],
)

export const SyncedItemCreatePayloadSchema = createInsertSchema(syncedItems)
export type SyncedItemCreatePayload = z.infer<typeof SyncedItemCreatePayloadSchema>

export const SyncedItemSchma = createSelectSchema(syncedItems)
export type SyncedItem = z.infer<typeof SyncedItemSchma>
