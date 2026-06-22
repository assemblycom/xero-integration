'use client'

import type { ProductMapping } from '@items-sync/types'
import { createContext, type PropsWithChildren, useCallback, useState } from 'react'
import type { SettingsFields } from '@/db/schema/settings.schema'
import type { ClientXeroAccounts } from '@/lib/xero/accounts'
import type { ClientXeroItem } from '@/lib/xero/types'

type BaseSettingsContextType = SettingsFields & {
  productMappings: ProductMapping[]
}

type WithXeroData = {
  xeroItems: ClientXeroItem[]
  xeroAccounts: ClientXeroAccounts
}

export type SettingsContextType = BaseSettingsContextType & {
  initialSettings: BaseSettingsContextType
} & WithXeroData

export const SettingsContext = createContext<
  | (SettingsContextType & {
      setSettings: React.Dispatch<React.SetStateAction<SettingsContextType>>
      updateSettings: (
        state: Omit<Partial<SettingsContextType>, 'xeroItems' | 'xeroAccounts'>,
      ) => void
    })
  | null
>(null)

export const SettingsContextProvider = ({
  syncProductsAutomatically,
  addAbsorbedFees,
  useCompanyName,
  initialInvoiceSettingsMapping,
  initialProductSettingsMapping,
  isSyncEnabled,
  countryCode,
  incomeAccountId,
  bankAccountId,
  expenseAccountId,
  productMappings,
  xeroItems,
  xeroAccounts,
  children,
}: BaseSettingsContextType & PropsWithChildren & WithXeroData) => {
  const [settings, setSettings] = useState<SettingsContextType>({
    syncProductsAutomatically,
    addAbsorbedFees,
    useCompanyName,
    initialInvoiceSettingsMapping,
    initialProductSettingsMapping,
    productMappings,
    isSyncEnabled,
    countryCode,
    incomeAccountId,
    bankAccountId,
    expenseAccountId,
    xeroItems,
    xeroAccounts,

    initialSettings: {
      syncProductsAutomatically,
      addAbsorbedFees,
      useCompanyName,
      initialInvoiceSettingsMapping,
      initialProductSettingsMapping,
      isSyncEnabled,
      countryCode,
      incomeAccountId,
      bankAccountId,
      expenseAccountId,
      productMappings,
    },
  })

  const updateSettings = useCallback(
    (state: Omit<Partial<SettingsContextType>, 'xeroItems' | 'xeroAccounts'>) => {
      setSettings((prev) => ({ ...prev, ...state }))
    },
    [],
  )

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        setSettings,
        updateSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}
