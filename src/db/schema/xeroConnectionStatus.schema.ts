import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import type z from 'zod'

// Secret-free mirror of xero_connections.status, one row per portal.
// Safe to expose to anon via Supabase Realtime — carries no tokenSet/tenantId.
export const xeroConnectionStatus = pgTable('xero_connection_status', {
  // Workspace ID / Portal ID in Copilot — one row per portal
  portalId: varchar({ length: 64 }).primaryKey().notNull(),

  // Connection status, mirrored from xero_connections.status by a DB trigger
  status: boolean().notNull().default(false),

  updatedAt: timestamp({ withTimezone: true, mode: 'date' }).defaultNow().notNull(),
})

export const XeroConnectionStatusSchema = createSelectSchema(xeroConnectionStatus)
export type XeroConnectionStatus = z.infer<typeof XeroConnectionStatusSchema>
