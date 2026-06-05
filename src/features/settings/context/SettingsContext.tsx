'use client'

import type { ProductMapping } from '@items-sync/types'
import { createContext, type PropsWithChildren, useCallback, useState } from 'react'
import type { SettingsFields } from '@/db/schema/settings.schema'
import type { ClientXeroItem } from '@/lib/xero/types'

type BaseSettingsContextType = SettingsFields & {
  productMappings: ProductMapping[]
}

type WithXeroItems = {
  xeroItems: ClientXeroItem[]
}

export type SettingsContextType = BaseSettingsContextType & {
  initialSettings: BaseSettingsContextType
} & WithXeroItems

export const SettingsContext = createContext<
  | (SettingsContextType & {
      setSettings: React.Dispatch<React.SetStateAction<SettingsContextType>>
      updateSettings: (state: Partial<SettingsContextType>) => void
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
  productMappings,
  xeroItems,
  children,
}: BaseSettingsContextType & PropsWithChildren & WithXeroItems) => {
  const [settings, setSettings] = useState<SettingsContextType>({
    syncProductsAutomatically,
    addAbsorbedFees,
    useCompanyName,
    initialInvoiceSettingsMapping,
    initialProductSettingsMapping,
    productMappings,
    isSyncEnabled,
    countryCode,
    xeroItems,

    initialSettings: {
      syncProductsAutomatically,
      addAbsorbedFees,
      useCompanyName,
      initialInvoiceSettingsMapping,
      initialProductSettingsMapping,
      isSyncEnabled,
      countryCode,
      productMappings,
    },
  })

  const updateSettings = useCallback((state: Omit<Partial<SettingsContextType>, 'xeroItems'>) => {
    setSettings((prev) => ({ ...prev, ...state }))
  }, [])

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
