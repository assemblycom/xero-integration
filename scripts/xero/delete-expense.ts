import { getXeroForTenant } from './_client'

// Usage: pnpm ex scripts/xero/delete-expense.ts <tenantId> <xeroPaymentId...> [--confirm]
//
// Deletes Xero expenses by their bank transaction id (xeroPaymentId).
// Takes one or more ids. Dry-run by default; pass --confirm to delete.
async function main() {
  const args = process.argv.slice(2)
  const confirm = args.includes('--confirm')
  const [tenantId, ...xeroPaymentIds] = args.filter((a) => !a.startsWith('--'))
  if (!tenantId || !xeroPaymentIds.length) {
    throw new Error(
      'Usage: pnpm ex scripts/xero/delete-expense.ts <tenantId> <xeroPaymentId...> [--confirm]',
    )
  }

  const { xero } = await getXeroForTenant(tenantId)

  // Fetch each one so the dry-run shows what will be deleted.
  console.info(`Transactions to delete (${xeroPaymentIds.length}):`)
  for (const id of xeroPaymentIds) {
    const tx = await xero.getBankTransaction(tenantId, id)
    if (!tx) {
      console.warn(`  ${id} -> NOT FOUND`)
      continue
    }
    console.info({
      bankTransactionID: tx.bankTransactionID,
      status: tx.status,
      reference: tx.reference,
      total: tx.total,
      lineItem: tx.lineItems?.[0]?.description,
    })
  }

  if (!confirm) {
    console.info('\nDry run. Re-run with --confirm to delete the above transaction(s).')
    return
  }

  for (const id of xeroPaymentIds) {
    const result = await xero.deleteBankTransaction(tenantId, id)
    console.info(`Deleted ${id} -> status ${result?.status}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
