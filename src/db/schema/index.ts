import { settings } from './settings.schema'
import { syncedContacts } from './syncedContacts.schema'
import { syncedInvoices } from './syncedInvoices.schema'
import { syncedItems } from './syncedItems.schema'
import { syncedPayments } from './syncedPayments.schema'
import { xeroConnectionStatus } from './xeroConnectionStatus.schema'
import { xeroConnections } from './xeroConnections.schema'

export const schema = {
  xeroConnections,
  xeroConnectionStatus,
  settings,
  syncedContacts,
  syncedInvoices,
  syncedItems,
  syncedPayments,
}
