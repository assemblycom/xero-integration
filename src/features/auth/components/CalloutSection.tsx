'use client'

import { useAuthContext } from '@auth/hooks/useAuth'
import { useTimeAgo } from '@auth/hooks/useTimeAgo'
import { updateSettingsAction } from '@settings/actions/settings'
import { useSettingsContext } from '@settings/hooks/useSettings'
import { Callout } from 'copilot-design-system'
import { CountryCode } from 'xero-node'

const NonUsCallout = () => (
  <div className="mb-4">
    <Callout
      title="Support Limited to U.S. Xero Accounts"
      description="At this time, the integration only supports US-based Xero accounts. To use the integration, please disconnect your current account and reconnect using a US Xero account."
      variant="error"
    />
  </div>
)

export const CalloutSection = () => {
  const { user, connectionStatus, needsReconnection, lastSyncedAt, countryCode } = useAuthContext()
  const {
    isSyncEnabled,
    initialInvoiceSettingsMapping,
    initialProductSettingsMapping,
    initialSettings,
    updateSettings,
  } = useSettingsContext()

  const timeAgo = useTimeAgo(lastSyncedAt)

  const isNonUSAccount = connectionStatus && countryCode && countryCode !== CountryCode.US

  if (needsReconnection) {
    return (
      <Callout
        title={'Sync failed'}
        description={'Please reauthorize your account to reconnect with Xero.'}
        variant={'error'}
        actionProps={{
          variant: 'primary',
          label: 'Reauthorize',
          prefixIcon: 'Repeat',
          onClick: (_e: unknown) => {
            window.open(`/auth/initiate?token=${user.token}`, '_blank', 'noopener,noreferrer')
          },
        }}
      />
    )
  }

  if (!connectionStatus)
    return (
      <Callout
        title={'Authorize your account'}
        description={'Log into Xero with an admin account to get started.'}
        variant={'info'}
        actionProps={{
          variant: 'primary',
          label: 'Connect to Xero',
          prefixIcon: 'Check',
          onClick: (_e: unknown) => {
            window.open(`/auth/initiate?token=${user.token}`, '_blank', 'noopener,noreferrer')
          },
        }}
      />
    )

  if (!isSyncEnabled)
    return (
      <>
        {isNonUSAccount && <NonUsCallout />}
        <Callout
          title={'Confirm your mapping before getting started.'}
          description={
            'Set your product mappings and review configuration settings to best set up your sync.'
          }
          variant={'warning'}
          actionProps={{
            variant: 'primary',
            label: 'Enable app',
            prefixIcon: 'Check',
            disabled:
              !!isNonUSAccount || !(initialInvoiceSettingsMapping && initialProductSettingsMapping),
            onClick: async (_e: unknown) => {
              const newSettings = await updateSettingsAction(user.token, { isSyncEnabled: true })
              updateSettings({
                ...newSettings,
                initialSettings: { ...initialSettings, ...newSettings },
              })
            },
          }}
        />
      </>
    )

  if (lastSyncedAt)
    return (
      <>
        {isNonUSAccount && <NonUsCallout />}
        <Callout
          title={'Xero sync is live'}
          description={`Last synced ${timeAgo}`}
          variant={'success'}
        />
      </>
    )

  if (isNonUSAccount) return <NonUsCallout />
}
