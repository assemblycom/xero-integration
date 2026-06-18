import { calculateTaxAmount } from '@invoice-sync/lib/utils'
import type { InvoiceCreatedEvent } from '@invoice-sync/types'
import type { Item, TaxRate, LineItem as XeroLineItem } from 'xero-node'
import type { ClientResponse, CompanyResponse } from '@/lib/copilot/types'
import { buildClientName } from '@/lib/copilot/utils'
import logger from '@/lib/logger'
import {
  type ContactCreatePayload,
  ContactCreatePayloadSchema,
  type LineItem,
  LineItemSchema,
} from '@/lib/xero/types'

export const serializeLineItems = (
  copilotItems: InvoiceCreatedEvent['lineItems'],
  productIdToXeroItem: Record<string, Item>,
  salesAccountCode: string,
  taxRate?: TaxRate,
): LineItem[] => {
  logger.info('invoice-sync/lib/serializers#serializeLineItems :: Serializing line items:', {
    copilotItems,
    productIdToXeroItem,
    taxRate,
  })

  const xeroLineItems: LineItem[] = []
  for (const item of copilotItems) {
    const xeroItem = item.productId ? productIdToXeroItem[item.productId] : undefined

    const payload = {
      // NOTE: Both lineItemID and itemCode need to be provided for an invoice item to map to an item in Xero
      // Ref: https://developer.xero.com/documentation/api/accounting/invoices#post-invoices
      // See section on LineItems elements
      lineItemID: xeroItem?.itemID,
      itemCode: xeroItem?.code,
      description: xeroItem?.name || item.description,
      unitAmount: item.amount / 100,
      quantity: item.quantity,
      taxAmount: calculateTaxAmount(item.amount, item.quantity, taxRate?.effectiveRate),
      taxType: taxRate?.taxType,
      accountCode: salesAccountCode,
    } satisfies XeroLineItem
    xeroLineItems.push(LineItemSchema.parse(payload))
  }

  return xeroLineItems
}

export const serializeContactForClient = (client: ClientResponse): ContactCreatePayload => {
  return ContactCreatePayloadSchema.parse({
    name: buildClientName(client),
    firstName: client.givenName,
    lastName: client.familyName,
    emailAddress: client.email,
  } satisfies ContactCreatePayload)
}

export const serializeContactForCompany = (
  company: CompanyResponse,
  emailAddress?: string,
): ContactCreatePayload => {
  return ContactCreatePayloadSchema.parse({
    name: `${company.name}`,
    emailAddress,
  } satisfies ContactCreatePayload)
}
