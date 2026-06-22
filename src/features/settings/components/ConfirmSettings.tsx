'use client'

import { useAuthContext } from '@auth/hooks/useAuth'
import { updateSettingsAction } from '@settings/actions/settings'
import { updateSyncedItemsAction } from '@settings/actions/syncedItems'
import type { SettingsContextType } from '@settings/context/SettingsContext'
import { useSettingsContext } from '@settings/hooks/useSettings'
import { Button } from 'copilot-design-system'
import isDeepEqual from 'deep-equal'
import { useState } from 'react'

interface ConfirmSettingsProps {
  mode: 'product' | 'invoice' | 'account'
}

export const ConfirmSettings = ({ mode }: ConfirmSettingsProps) => {
  const {
    initialSettings,
    initialProductSettingsMapping,
    initialInvoiceSettingsMapping,
    syncProductsAutomatically,
    productMappings,
    addAbsorbedFees,
    useCompanyName,
    incomeAccountId,
    bankAccountId,
    expenseAccountId,
    updateSettings,
  } = useSettingsContext()

  const { user, tenantId } = useAuthContext()

  const [isPending, setIsPending] = useState(false)

  let initialMapping: boolean
  let showButtons: boolean
  if (mode === 'product') {
    initialMapping = initialProductSettingsMapping
    showButtons =
      syncProductsAutomatically !== initialSettings.syncProductsAutomatically ||
      !isDeepEqual(productMappings, initialSettings.productMappings)
  } else if (mode === 'invoice') {
    initialMapping = initialInvoiceSettingsMapping
    showButtons =
      addAbsorbedFees !== initialSettings.addAbsorbedFees ||
      useCompanyName !== initialSettings.useCompanyName
  } else {
    // No first-time flag for accounts; show controls only when there are changes.
    initialMapping = true
    showButtons =
      incomeAccountId !== initialSettings.incomeAccountId ||
      bankAccountId !== initialSettings.bankAccountId ||
      expenseAccountId !== initialSettings.expenseAccountId
  }

  const onConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    if (!tenantId) return null

    setIsPending(true)
    try {
      if (mode === 'product') {
        updateSettings({ initialProductSettingsMapping: true })

        const [newSettings, newMappings] = await Promise.all([
          updateSettingsAction(user.token, {
            syncProductsAutomatically,
            initialProductSettingsMapping: true,
          }),
          updateSyncedItemsAction(user.token, productMappings),
        ])
        updateSettings({
          initialSettings: {
            ...initialSettings,
            ...newSettings,
            productMappings: newMappings,
          },
          ...newSettings,
          productMappings: newMappings,
        })
      } else if (mode === 'invoice') {
        updateSettings({ initialInvoiceSettingsMapping: true })

        const newSettings = await updateSettingsAction(user.token, {
          addAbsorbedFees,
          useCompanyName,
          initialInvoiceSettingsMapping: true,
        })
        updateSettings({
          initialSettings: {
            ...initialSettings,
            ...newSettings,
          },
          ...newSettings,
        })
      } else {
        const newSettings = await updateSettingsAction(user.token, {
          incomeAccountId,
          bankAccountId,
          expenseAccountId,
        })
        updateSettings({
          initialSettings: {
            ...initialSettings,
            ...newSettings,
          },
          ...newSettings,
        })
      }
    } catch (e) {
      // We can dispatch an error toast here
      console.error(e)
    } finally {
      setIsPending(false)
    }
  }

  const onCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const resetPayload: Partial<SettingsContextType> =
      mode === 'product'
        ? {
            syncProductsAutomatically: initialSettings.syncProductsAutomatically,
            productMappings: initialSettings.productMappings,
          }
        : mode === 'invoice'
          ? {
              addAbsorbedFees: initialSettings.addAbsorbedFees,
              useCompanyName: initialSettings.useCompanyName,
            }
          : {
              incomeAccountId: initialSettings.incomeAccountId,
              bankAccountId: initialSettings.bankAccountId,
              expenseAccountId: initialSettings.expenseAccountId,
            }
    updateSettings(resetPayload)
  }

  if ((initialMapping && !showButtons) || isPending) return null

  return (
    <div className="flex max-h-6 select-none items-center justify-end">
      <Button
        label="Cancel"
        type="reset"
        variant="text"
        className="me-2"
        onMouseUp={onCancel}
        disabled={isPending}
      />
      <Button
        label={initialMapping ? 'Update Setting' : 'Confirm'}
        variant="primary"
        prefixIcon="Check"
        onMouseUp={onConfirm}
        disabled={isPending}
      />
    </div>
  )
}
