import type { SettingsContextType } from '@settings/context/SettingsContext'
import { useDropdown } from '@settings/hooks/useDropdown'
import { useSettingsContext } from '@settings/hooks/useSettings'
import { Icon } from 'copilot-design-system'
import { useEffect, useRef, useState } from 'react'
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

// Focus index for the default option. -1 = none, 0.. = accounts.
const DEFAULT_OPTION_INDEX = -2

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
  const { dropdownRef } = useDropdown({ setOpenDropdownId })
  const { updateSettings } = useSettingsContext()

  // Only active accounts are listed, so a missing/archived saved id won't match.
  const selectedAccount = accounts.find((account) => account.accountId === selectedAccountId)
  const hasStaleSelection = !selectedAccount && selectedAccountId !== null

  // The default is usable unless an archived account holds its code (can't be recreated).
  const defaultActiveAccount = defaultCode
    ? accounts.find((account) => account.code === defaultCode)
    : undefined
  const defaultUsable = defaultCode !== null && !defaultIsArchived
  const defaultDisplay = formatDefaultDisplay(defaultActiveAccount, defaultName, defaultCode)

  const [searchQuery, setSearchQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  const isOpen = openDropdownId === field

  // Only payment-enabled income/expense accounts are selectable; bank accounts lack the flag.
  const requiresPayments = field !== 'bankAccountId'

  const filteredAccounts = accounts.filter((account) => {
    if (requiresPayments && account.enablePaymentsToAccount !== true) return false
    // Shown in the header row; don't list it twice.
    if (defaultUsable && account.accountId === defaultActiveAccount?.accountId) return false
    const query = searchQuery.toLowerCase()
    return (
      (account.name ?? '').toLowerCase().includes(query) ||
      (account.code ?? '').toLowerCase().includes(query)
    )
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset focus when query changes
  useEffect(() => {
    setFocusedIndex(-1)
  }, [searchQuery])

  useEffect(() => {
    if (!isOpen) setSearchQuery('')
  }, [isOpen])

  useEffect(() => {
    // Only account rows live in the scrollable list.
    if (focusedIndex < 0 || !listRef.current) return
    const focusedElement = listRef.current.children[focusedIndex] as HTMLElement | undefined
    focusedElement?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex])

  const selectAccount = (account: ClientXeroAccount) => {
    updateSettings({ [field]: account.accountId } as Partial<SettingsContextType>)
    setOpenDropdownId(null)
  }

  // Clear to fall back to the region default.
  const selectDefault = () => {
    updateSettings({ [field]: null } as Partial<SettingsContextType>)
    setOpenDropdownId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const lastIndex = filteredAccounts.length - 1
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((prev) => {
        // From the top, hit the default option first when available.
        if (prev === -1) {
          if (defaultUsable) return DEFAULT_OPTION_INDEX
          return lastIndex >= 0 ? 0 : -1
        }
        if (prev === DEFAULT_OPTION_INDEX) return lastIndex >= 0 ? 0 : DEFAULT_OPTION_INDEX
        return Math.min(prev + 1, lastIndex)
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((prev) => {
        if (prev === -1) return lastIndex >= 0 ? lastIndex : DEFAULT_OPTION_INDEX
        if (prev === 0) return defaultUsable ? DEFAULT_OPTION_INDEX : 0
        // Default option is the top; no wrap.
        if (prev === DEFAULT_OPTION_INDEX) return DEFAULT_OPTION_INDEX
        return Math.max(prev - 1, 0)
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIndex === DEFAULT_OPTION_INDEX) selectDefault()
      else if (filteredAccounts[focusedIndex]) selectAccount(filteredAccounts[focusedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpenDropdownId(null)
    }
  }

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
          <div
            ref={dropdownRef}
            className="account-dropdown !shadow-[0_6px_20px_0_rgba(0,0,0,0.07)] absolute top-full right-0 left-0 z-100 mt-[-2px] rounded-sm border border-dropdown-border bg-white"
          >
            <div className="px-3 py-2">
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                // biome-ignore lint/a11y/noAutofocus: focus search on open, matches product mapping
                autoFocus
                className="w-full text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>

            {defaultUsable && (
              <div
                className={`border-card-divider border-t-1 transition-colors hover:bg-gray-100 ${
                  focusedIndex === DEFAULT_OPTION_INDEX ? 'bg-gray-100' : ''
                }`}
              >
                <button
                  type="button"
                  className="h-full w-full cursor-pointer px-3 py-2 text-left text-sm text-text-primary"
                  onClick={selectDefault}
                >
                  {`Use default account (${defaultDisplay})`}
                </button>
              </div>
            )}

            <div className="max-h-56 overflow-y-auto border-card-divider border-t-1" ref={listRef}>
              {filteredAccounts.map((account, index) => (
                <button
                  type="button"
                  key={account.accountId}
                  onClick={() => selectAccount(account)}
                  className={`account-option-btn flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-gray-100 ${
                    index === focusedIndex ? 'bg-gray-100' : ''
                  }`}
                >
                  <span className="line-clamp-1 break-all text-text-primary lg:break-normal">
                    {account.name ?? 'Unnamed account'}
                  </span>
                  {account.code && (
                    <span className="ps-2 text-body-micro text-gray-500 leading-body-micro">
                      {account.code}
                    </span>
                  )}
                </button>
              ))}
              {filteredAccounts.length === 0 && (
                <div className="px-3 py-2 text-gray-500 text-sm">No accounts found</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
