import { and, eq } from 'drizzle-orm'
import type { BankTransaction } from 'xero-node'
import db from '@/db'
import { PaymentUserType, syncedPayments } from '@/db/schema/syncedPayments.schema'
import { getXeroForTenant } from './_client'

// Usage: pnpm ex scripts/xero/check-expense.ts <tenantId> <copilotPaymentId>
//
// Lists the Xero expenses for a payment so you can review duplicates.
// New rows use the payment id as reference; old ones use the invoice id,
// so we look up the invoice id from the db and search both.
async function main() {
  const [tenantId, copilotPaymentId] = process.argv.slice(2)
  if (!tenantId || !copilotPaymentId) {
    throw new Error('Usage: pnpm ex scripts/xero/check-expense.ts <tenantId> <copilotPaymentId>')
  }

  const { xero } = await getXeroForTenant(tenantId)

  const record = await db
    .select()
    .from(syncedPayments)
    .where(
      and(
        eq(syncedPayments.tenantId, tenantId),
        eq(syncedPayments.copilotPaymentId, copilotPaymentId),
        eq(syncedPayments.type, PaymentUserType.EXPENSE),
      ),
    )
    .then((rows) => rows[0])

  console.info('\nsynced_payments row:', record ?? '(none found)')

  // Old expenses reference the invoice id, new ones the payment id.
  const references = [copilotPaymentId, record?.xeroInvoiceId].filter(Boolean) as string[]

  const byId = new Map<string, BankTransaction>()
  for (const reference of references) {
    const transactions = await xero.getBankTransactionsByReference(tenantId, reference)
    for (const tx of transactions) {
      if (tx.bankTransactionID) byId.set(tx.bankTransactionID, tx)
    }
  }

  const transactions = [...byId.values()]
  console.info(
    `\nFound ${transactions.length} SPEND transaction(s) for payment ${copilotPaymentId}:`,
  )
  for (const tx of transactions) {
    console.info({
      bankTransactionID: tx.bankTransactionID,
      status: tx.status,
      date: tx.date,
      reference: tx.reference,
      total: tx.total,
      lineItem: tx.lineItems,
    })
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
