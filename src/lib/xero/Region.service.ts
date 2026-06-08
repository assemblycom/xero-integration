import 'server-only'

import SettingsService from '@settings/lib/Settings.service'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import { isSupportedCountry, type RegionConfig, regionConfigFor } from '@/lib/xero/region'

class RegionService extends AuthenticatedXeroService {
  async resolveCountryCode(): Promise<string | null> {
    const settingsService = new SettingsService(this.user, this.connection)
    const settings = await settingsService.getOrCreateSettings()

    if (settings.countryCode) return settings.countryCode

    logger.info(
      'RegionService#resolveCountryCode :: countryCode not cached, fetching live from Xero',
    )
    const countryCode = await this.xero.getOrganisationCountryCode(this.connection.tenantId)
    if (!countryCode) return null

    await settingsService.updateSettings({ countryCode: String(countryCode) })
    return String(countryCode)
  }

  /** Returns the org's region config, or null if its country isn't supported. */
  async getRegionConfig(): Promise<RegionConfig | null> {
    const countryCode = await this.resolveCountryCode()
    if (!isSupportedCountry(countryCode)) {
      logger.info(
        `RegionService#getRegionConfig :: Xero region ${countryCode ?? 'unknown'} is not supported`,
      )
      return null
    }
    return regionConfigFor(countryCode)
  }
}

export default RegionService
