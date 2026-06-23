'use client'

import { useAuthContext } from '@auth/hooks/useAuth'
import {
  type AccountFieldKey,
  AccountSelect,
} from '@settings/components/AccountMapping/AccountSelect'
import { useSettingsContext } from '@settings/hooks/useSettings'
import { useState } from 'react'
import type { ClientXeroAccount } from '@/lib/xero/accounts'
import { isSupportedCountry, regionConfigFor } from '@/lib/xero/region'

export const AccountMapping = () => {
  const { xeroAccounts, incomeAccountId, bankAccountId, expenseAccountId } = useSettingsContext()
  const { countryCode } = useAuthContext()
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)

  // Region defaults used when a field is unset.
  const regionConfig = isSupportedCountry(countryCode) ? regionConfigFor(countryCode) : null

  // An archived default code can't be recreated, so force an explicit selection.
  const isDefaultArchived = (defaultCode: string | null): boolean =>
    !!defaultCode && xeroAccounts.archivedAccountCodes.includes(defaultCode)

  const rows: {
    label: string
    description: string
    field: AccountFieldKey
    accounts: ClientXeroAccount[]
    selectedAccountId: string | null
    defaultCode: string | null
    defaultName: string | null
  }[] = [
    {
      label: 'Income account',
      description: 'Default income account assigned to services synced from Assembly to Xero.',
      field: 'incomeAccountId',
      accounts: xeroAccounts.income,
      selectedAccountId: incomeAccountId,
      defaultCode: regionConfig?.accountCodes.sales ?? null,
      defaultName: regionConfig?.accountNames.sales ?? null,
    },
    {
      label: 'Expense account',
      description: 'Account where absorbed invoice payment fees are recorded as expenses in Xero.',
      field: 'expenseAccountId',
      accounts: xeroAccounts.expense,
      selectedAccountId: expenseAccountId,
      defaultCode: regionConfig?.accountCodes.merchantFees ?? null,
      defaultName: regionConfig?.accountNames.expense ?? null,
    },
    {
      label: 'Bank account',
      description:
        'Account the absorbed invoice payment fees are paid out of, paired with the expense account above.',
      field: 'bankAccountId',
      accounts: xeroAccounts.bank,
      selectedAccountId: bankAccountId,
      defaultCode: regionConfig?.accountCodes.bank ?? null,
      defaultName: regionConfig?.accountNames.asset ?? null,
    },
  ]

  return (
    <div className="mt-2 mb-6">
      {rows.map((row) => (
        <AccountSelect
          key={row.field}
          label={row.label}
          description={row.description}
          field={row.field}
          accounts={row.accounts}
          selectedAccountId={row.selectedAccountId}
          defaultCode={row.defaultCode}
          defaultName={row.defaultName}
          defaultIsArchived={isDefaultArchived(row.defaultCode)}
          openDropdownId={openDropdownId}
          setOpenDropdownId={setOpenDropdownId}
        />
      ))}
    </div>
  )
}
