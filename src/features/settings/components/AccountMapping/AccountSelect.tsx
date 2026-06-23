import type { SettingsContextType } from '@settings/context/SettingsContext'
import { useSettingsContext } from '@settings/hooks/useSettings'
import { Icon } from 'copilot-design-system'
import { SearchableSelectMenu } from '@/components/ui/SearchableSelectMenu'
import type { ClientXeroAccount } from '@/lib/xero/accounts'

export type AccountFieldKey = 'incomeAccountId' | 'bankAccountId' | 'expenseAccountId'

interface AccountSelectProps {
  label: string
  description: string
  field: AccountFieldKey
  accounts: ClientXeroAccount[]
  selectedAccountId: string | null
  // Region default for this role, used when unset.
  defaultCode: string | null
  defaultName: string | null
  // Default code is held by an archived account (can't be recreated).
  defaultIsArchived: boolean
  openDropdownId: string | null
  setOpenDropdownId: React.Dispatch<React.SetStateAction<string | null>>
}

const accountLabel = (account: ClientXeroAccount): string =>
  account.code
    ? `${account.name ?? 'Unnamed account'} (${account.code})`
    : (account.name ?? 'Unnamed account')

// "name - code" form for the default affordance.
const defaultAccountLabel = (account: ClientXeroAccount): string =>
  account.code
    ? `${account.name ?? 'Unnamed account'} - ${account.code}`
    : (account.name ?? 'Unnamed account')

// Default label: the live account, else the name/code we'd create.
const formatDefaultDisplay = (
  defaultActiveAccount: ClientXeroAccount | undefined,
  defaultName: string | null,
  defaultCode: string | null,
): string => {
  if (defaultActiveAccount) return defaultAccountLabel(defaultActiveAccount)
  if (defaultName && defaultCode) return `${defaultName} - ${defaultCode}`
  return defaultCode ?? ''
}

// Trigger tone → text colour.
type TriggerTone = 'primary' | 'danger' | 'muted'

const TRIGGER_TONE_CLASS: Record<TriggerTone, string> = {
  primary: 'text-text-primary',
  danger: 'text-red-600',
  muted: 'text-gray-500',
}

export const AccountSelect = ({
  label,
  description,
  field,
  accounts,
  selectedAccountId,
  defaultCode,
  defaultName,
  defaultIsArchived,
  openDropdownId,
  setOpenDropdownId,
}: AccountSelectProps) => {
  const { updateSettings } = useSettingsContext()

  // Only active accounts are listed, so a missing/archived saved id won't match.
  const selectedAccount = accounts.find((account) => account.accountId === selectedAccountId)
  const hasStaleSelection = !selectedAccount && selectedAccountId !== null

  // The default is usable unless an archived account holds its code (can't be recreated).
  const defaultActiveAccount = defaultCode
    ? accounts.find((account) => account.code === defaultCode)
    : undefined
  const defaultUsable = !!defaultCode && !defaultIsArchived
  const defaultDisplay = formatDefaultDisplay(defaultActiveAccount, defaultName, defaultCode)

  const isOpen = openDropdownId === field

  // Only payment-enabled income/expense accounts are selectable; bank accounts lack the flag.
  const requiresPayments = field !== 'bankAccountId'

  const filteredAccounts = accounts.filter((account) => {
    if (requiresPayments && account.enablePaymentsToAccount !== true) return false
    // Shown in the header row; don't list it twice.
    if (defaultUsable && account.accountId === defaultActiveAccount?.accountId) return false
    return true
  })

  // Trigger label + tone, in priority order.
  let triggerLabel: string
  let triggerTone: TriggerTone
  if (selectedAccount) {
    triggerLabel = accountLabel(selectedAccount)
    triggerTone = 'primary'
  } else if (hasStaleSelection) {
    triggerLabel = 'Selected account unavailable'
    triggerTone = 'danger'
  } else if (defaultIsArchived) {
    triggerLabel = 'Default account unavailable — please select an account'
    triggerTone = 'danger'
  } else if (defaultUsable) {
    triggerLabel = `Use default account (${defaultDisplay})`
    triggerTone = 'muted'
  } else {
    triggerLabel = `Please select ${label.toLowerCase()}`
    triggerTone = 'muted'
  }

  return (
    <div className="mb-6">
      <div className="font-semibold text-sm text-text-primary leading-5">{label}</div>
      <p className="mt-1 mb-2 text-gray-600 text-sm leading-5">{description}</p>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenDropdownId((prev) => (prev === field ? null : field))}
          className="mapping-btn flex w-full items-center justify-between rounded-sm border border-dropdown-border bg-gray-100 px-3 py-2 transition-colors hover:bg-gray-150"
        >
          <span
            className={`line-clamp-1 break-all text-left text-sm lg:break-normal ${TRIGGER_TONE_CLASS[triggerTone]}`}
          >
            {triggerLabel}
          </span>
          <Icon icon="ChevronDown" width={16} height={16} className="ms-2 text-gray-500" />
        </button>

        {isOpen && (
          <SearchableSelectMenu
            onClose={() => setOpenDropdownId(null)}
            className="!shadow-[0_6px_20px_0_rgba(0,0,0,0.07)] absolute top-full right-0 left-0 z-100 mt-[-2px] rounded-sm border border-dropdown-border bg-white"
            options={filteredAccounts}
            getOptionKey={(account) => account.accountId}
            getSearchValues={(account) => [account.name ?? '', account.code ?? '']}
            onSelect={(account) =>
              updateSettings({ [field]: account.accountId } as Partial<SettingsContextType>)
            }
            emptyText="No accounts found"
            action={
              defaultUsable
                ? {
                    render: () => `Use default account (${defaultDisplay})`,
                    onSelect: () =>
                      updateSettings({ [field]: null } as Partial<SettingsContextType>),
                  }
                : undefined
            }
            renderOption={(account) => (
              <>
                <span className="line-clamp-1 break-all text-text-primary lg:break-normal">
                  {account.name ?? 'Unnamed account'}
                </span>
                {account.code && (
                  <span className="ps-2 text-body-micro text-gray-500 leading-body-micro">
                    {account.code}
                  </span>
                )}
              </>
            )}
          />
        )}
      </div>
    </div>
  )
}
