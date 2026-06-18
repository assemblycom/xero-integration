import { type Account, AccountType } from 'xero-node'

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

// Maps a Xero account to the role it can fill, or null if it fills none we care about.
export const categorizeAccount = (account: Account): AccountCategory | null => {
  if (!account.type) return null
  if (INCOME_ACCOUNT_TYPES.includes(account.type)) return 'income'
  if (EXPENSE_ACCOUNT_TYPES.includes(account.type)) return 'expense'
  if (BANK_ACCOUNT_TYPES.includes(account.type)) return 'bank'
  return null
}

// Client-safe shape passed to the settings UI (consumed by the UI ticket).
export interface ClientXeroAccount {
  accountId: string
  // null when Xero omits the name; the UI layer decides the display fallback
  name: string | null
  code: string | null
  category: AccountCategory
}

// Returns null for accounts with no usable id or no category we map.
export const toClientXeroAccount = (account: Account): ClientXeroAccount | null => {
  const category = categorizeAccount(account)
  if (!account.accountID || !category) return null
  return {
    accountId: account.accountID,
    name: account.name ?? null,
    code: account.code ?? null,
    category,
  }
}
