import { AppMenuTrigger } from '@auth/components/AppBridge'
import { CalloutSection } from '@auth/components/CalloutSection'
import { RealtimeXeroConnections } from '@auth/components/RealtimeXeroConnections'
import { AuthContextProvider } from '@auth/context/AuthContext'
import AuthService from '@auth/lib/Auth.service'
import XeroConnectionsService from '@auth/lib/XeroConnections.service'
import { SettingsForm } from '@settings/components/SettingsForm'
import { defaultSettings } from '@settings/constants/defaults'
import { SettingsContextProvider } from '@settings/context/SettingsContext'
import ProductMappingsService from '@settings/lib/ProductMappings.service'
import SettingsService from '@settings/lib/Settings.service'
import XeroAccountsService from '@settings/lib/XeroAccounts.service'
import { SyncLogsService } from '@sync-logs/lib/SyncLogs.service'
import type { CountryCode } from 'xero-node'
import type { PageProps } from '@/app/(home)/types'
import type { SettingsFields } from '@/db/schema/settings.schema'
import type { XeroConnection, XeroConnectionWithTokenSet } from '@/db/schema/xeroConnections.schema'
import { CopilotAPI } from '@/lib/copilot/CopilotAPI'
import { serializeClientUser } from '@/lib/copilot/models/ClientUser.model'
import User from '@/lib/copilot/models/User.model'
import logger from '@/lib/logger'
import type { ClientXeroAccounts } from '@/lib/xero/accounts'
import { isSupportedCountry } from '@/lib/xero/region'
import type { ClientXeroItem } from '@/lib/xero/types'
import XeroAPI from '@/lib/xero/XeroAPI'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

const hasValidAccessToken = (connection: XeroConnection): boolean => {
  if (!connection.tokenSet?.access_token || !connection.tokenSet?.expires_at) return false
  return connection.tokenSet.expires_at * 1000 > Date.now()
}

const isXeroAuthError = (error: unknown): boolean => {
  try {
    const message = error instanceof Error ? error.message : String(error)
    const parsed = JSON.parse(message)
    const statusCode = parsed?.response?.statusCode
    return statusCode === 401 || statusCode === 403
  } catch {
    return false
  }
}

/**
 * Wraps a promise to catch Xero API errors gracefully.
 * Returns the fallback value on failure and flags auth errors via the callback.
 */
const withXeroErrorHandler = <T,>(
  promise: Promise<T>,
  fallback: T,
  context: string,
  onAuthError: () => void,
): Promise<T> =>
  promise.catch((error) => {
    logger.error(`app/(home)/page :: ${context}:`, error)
    if (isXeroAuthError(error)) onAuthError()
    return fallback
  })

const ensureValidConnection = async (
  user: User,
  connection: XeroConnection,
): Promise<XeroConnection> => {
  if (hasValidAccessToken(connection)) return connection

  if (!connection.tokenSet?.refresh_token) return connection

  try {
    const xero = new XeroAPI()
    const tokenSet = await xero.refreshWithRefreshToken(connection.tokenSet.refresh_token)
    const connectionsService = new XeroConnectionsService(user)
    return await connectionsService.updateConnectionForWorkspace({ tokenSet, status: true })
  } catch (error) {
    logger.error('app/(home)/page :: Failed to refresh Xero access token:', error)
    return { ...connection, status: false }
  }
}

const getSettings = async (user: User, connection: XeroConnection) => {
  let settings: SettingsFields
  if (connection.tenantId) {
    // Using tenantID even though tokenSet might be expired because the sync-settings feature don't need to perform Xero API calls
    const settingsService = new SettingsService(user, connection as XeroConnectionWithTokenSet)
    settings = await settingsService.getOrCreateSettings()
  } else {
    settings = defaultSettings
  }
  return settings
}

const getProductMappings = async (
  user: User,
  connection: XeroConnection,
): ReturnType<ProductMappingsService['getProductMappings']> => {
  if (!connection.tenantId || !connection.status) return []

  const productMappingsService = new ProductMappingsService(
    user,
    connection as XeroConnectionWithTokenSet,
  )
  return await productMappingsService.getProductMappings()
}

const getXeroItems = async (user: User, connection: XeroConnection): Promise<ClientXeroItem[]> => {
  if (!connection.tenantId || !connection.status) return []

  const productMappingsService = new ProductMappingsService(
    user,
    connection as XeroConnectionWithTokenSet,
  )
  return await productMappingsService.getClientXeroItems()
}

const getXeroAccounts = async (
  user: User,
  connection: XeroConnection,
): Promise<ClientXeroAccounts> => {
  if (!connection.tenantId || !connection.status || !connection.tokenSet)
    return { income: [], bank: [], expense: [], archivedAccountCodes: [] }

  const xeroAccountsService = new XeroAccountsService(
    user,
    connection as XeroConnectionWithTokenSet,
  )
  return await xeroAccountsService.getClientXeroAccounts()
}

const getLastSyncedAt = async (user: User, connection: XeroConnection): Promise<Date | null> => {
  if (!connection.tenantId || !connection.tokenSet) return null

  const syncLogsService = new SyncLogsService(user, connection as XeroConnectionWithTokenSet)
  return await syncLogsService.getLastSyncedAt()
}

const getCountryCode = async (connection: XeroConnection): Promise<CountryCode | null> => {
  if (!connection.tenantId || !connection.status || !connection.tokenSet) return null

  const xero = new XeroAPI()
  xero.setTokenSet(connection.tokenSet)
  const countryCode = await xero.getOrganisationCountryCode(connection.tenantId)
  return countryCode || null
}

const getPageData = async (user: User, connection: XeroConnection) => {
  let xeroAuthFailed = false
  const onAuthError = () => {
    xeroAuthFailed = true
  }

  const [settings, productMappings, xeroItems, xeroAccounts, lastSyncedAt, countryCode] =
    await Promise.all([
      getSettings(user, connection),
      withXeroErrorHandler(
        getProductMappings(user, connection),
        [],
        'Error fetching product mappings',
        onAuthError,
      ),
      withXeroErrorHandler(
        getXeroItems(user, connection),
        [],
        'Error fetching xero items',
        onAuthError,
      ),
      withXeroErrorHandler(
        getXeroAccounts(user, connection),
        { income: [], bank: [], expense: [], archivedAccountCodes: [] },
        'Error fetching xero accounts',
        onAuthError,
      ),
      getLastSyncedAt(user, connection),
      withXeroErrorHandler(
        getCountryCode(connection),
        null,
        'Error fetching organisation country code',
        onAuthError,
      ),
    ])

  return {
    settings,
    productMappings,
    xeroItems,
    xeroAccounts,
    lastSyncedAt,
    countryCode,
    xeroAuthFailed,
  }
}

const Home = async ({ searchParams }: PageProps) => {
  const sp = await searchParams
  const user = await User.authenticate(sp.token)

  const authService = new AuthService(user)

  const copilot = new CopilotAPI(user.token)
  const [rawConnection, workspace] = await Promise.all([
    authService.authorizeXeroForCopilotWorkspace(true),
    copilot.getWorkspace(),
  ])
  const connection = await ensureValidConnection(user, rawConnection)

  const {
    settings,
    productMappings,
    xeroItems,
    xeroAccounts,
    lastSyncedAt,
    countryCode,
    xeroAuthFailed,
  } = await getPageData(user, connection)

  // Persist the resolved country code and gate sync to supported regions (US, AU)
  if (countryCode && connection.tenantId) {
    const patch: Partial<SettingsFields> = {}

    if (settings.countryCode !== String(countryCode)) {
      patch.countryCode = String(countryCode)
      settings.countryCode = String(countryCode)
    }

    if (!isSupportedCountry(countryCode) && settings.isSyncEnabled) {
      patch.isSyncEnabled = false
      settings.isSyncEnabled = false
    }

    if (Object.keys(patch).length) {
      const settingsService = new SettingsService(user, connection as XeroConnectionWithTokenSet)
      await settingsService.updateSettings(patch)
    }
  }

  const clientUser = serializeClientUser(user)
  logger.info(
    'app/(home)/page :: Serving Xero Integration app for user',
    clientUser,
    'with connectionId',
    connection.id,
  )

  const needsReconnection =
    xeroAuthFailed ||
    (!!connection.tokenSet && (connection.tokenSet.expires_at || 0) * 1000 < Date.now())

  return (
    <AuthContextProvider
      user={clientUser}
      tenantId={connection.tenantId}
      connectionStatus={!!connection.status}
      needsReconnection={needsReconnection}
      lastSyncedAt={lastSyncedAt}
      workspace={workspace}
      countryCode={countryCode ?? (settings.countryCode as CountryCode | null)}
    >
      <SettingsContextProvider
        {...settings}
        productMappings={productMappings}
        xeroItems={xeroItems}
        xeroAccounts={xeroAccounts}
      >
        <main className="min-h-[100vh] px-8 pt-6 pb-[54px] sm:px-[100px] lg:px-[220px]">
          <RealtimeXeroConnections user={clientUser} />
          <AppMenuTrigger token={clientUser.token} />
          <CalloutSection />
          <section>
            <SettingsForm />
          </section>
        </main>
      </SettingsContextProvider>
    </AuthContextProvider>
  )
}

export default Home
