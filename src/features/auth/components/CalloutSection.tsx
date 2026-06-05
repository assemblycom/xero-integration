'use client'

import { useAuthContext } from '@auth/hooks/useAuth'
import { useTimeAgo } from '@auth/hooks/useTimeAgo'
import { updateSettingsAction } from '@settings/actions/settings'
import { useSettingsContext } from '@settings/hooks/useSettings'
import { Callout } from 'copilot-design-system'
import { isSupportedCountry } from '@/lib/xero/region'

const UnsupportedRegionCallout = () => (
  <div className="mb-4">
    <Callout
      title="Xero region not supported"
      description="The integration currently supports US and Australian Xero accounts. To use it, please disconnect and reconnect using a Xero account based in the United States or Australia."
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

  // Only flag a region as unsupported once it is known; an unresolved countryCode
  // (e.g. a transient fetch failure) must not surface the error callout.
  const isUnsupportedRegion = connectionStatus && !!countryCode && !isSupportedCountry(countryCode)

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
        {isUnsupportedRegion && <UnsupportedRegionCallout />}
        <Callout
          title={'Confirm your mapping before getting started.'}
          description={
            'Set your service mappings and review configuration settings to best set up your sync.'
          }
          variant={'warning'}
          actionProps={{
            variant: 'primary',
            label: 'Enable app',
            prefixIcon: 'Check',
            disabled:
              !!isUnsupportedRegion ||
              !(initialInvoiceSettingsMapping && initialProductSettingsMapping),
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
        {isUnsupportedRegion && <UnsupportedRegionCallout />}
        <Callout
          title={'Xero sync is live'}
          description={`Last synced ${timeAgo}`}
          variant={'success'}
        />
      </>
    )

  if (isUnsupportedRegion) return <UnsupportedRegionCallout />
}
