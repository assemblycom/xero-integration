import { Account, AccountType } from 'xero-node'

// Account types Xero accepts for each role. We only treat a configured account as a
// conflict when its type genuinely can't back that transaction (not for equivalent types).
export const INCOME_ACCOUNT_TYPES: AccountType[] = [
  AccountType.SALES,
  AccountType.REVENUE,
  AccountType.OTHERINCOME,
]

export const EXPENSE_ACCOUNT_TYPES: AccountType[] = [
  AccountType.EXPENSE,
  AccountType.OVERHEADS,
  AccountType.DIRECTCOSTS,
]

export const BANK_ACCOUNT_TYPES: AccountType[] = [AccountType.BANK]

export type AccountCategory = 'income' | 'expense' | 'bank'

// Role noun used in operator-facing account messages (the income role reads as "sales").
export type AssemblyAccountRole = 'sales' | 'expense' | 'bank'

// Maps a Xero account to the role it can fill, or null if it fills none we care about.
export const categorizeAccount = (account: Account): AccountCategory | null => {
  if (!account.type) return null
  if (INCOME_ACCOUNT_TYPES.includes(account.type)) return 'income'
  if (EXPENSE_ACCOUNT_TYPES.includes(account.type)) return 'expense'
  if (BANK_ACCOUNT_TYPES.includes(account.type)) return 'bank'
  return null
}

// Client-safe shape passed to the settings UI.
export interface ClientXeroAccount {
  accountId: string
  // null when Xero omits the name
  name: string | null
  code: string | null
  category: AccountCategory
  // Accepts payments. null for bank accounts (no such flag).
  enablePaymentsToAccount: boolean | null
}

// Null for inactive accounts, or those with no id/category we map.
export const toClientXeroAccount = (account: Account): ClientXeroAccount | null => {
  const category = categorizeAccount(account)
  if (!account.accountID || !category || account.status !== Account.StatusEnum.ACTIVE) return null
  return {
    accountId: account.accountID,
    name: account.name ?? null,
    code: account.code ?? null,
    category,
    enablePaymentsToAccount: account.enablePaymentsToAccount ?? null,
  }
}

// Accounts grouped by role for the settings UI.
export interface ClientXeroAccounts {
  income: ClientXeroAccount[]
  bank: ClientXeroAccount[]
  expense: ClientXeroAccount[]
  // Codes held by archived accounts; a default on one can't be recreated.
  archivedAccountCodes: string[]
}
