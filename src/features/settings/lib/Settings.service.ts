import { defaultSettings } from '@settings/constants/defaults'
import { and, eq } from 'drizzle-orm'
import status from 'http-status'
import { getTableFields } from '@/db/db.helpers'
import { type SettingsFields, settings } from '@/db/schema/settings.schema'
import APIError from '@/errors/APIError'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'

class SettingsService extends AuthenticatedXeroService {
  private readonly settingsFields = getTableFields(settings, [
    'syncProductsAutomatically',
    'addAbsorbedFees',
    'useCompanyName',
    'isSyncEnabled',
    'initialInvoiceSettingsMapping',
    'initialProductSettingsMapping',
  ])

  private readonly MAX_RETRY_ATTEMPTS = 3

  async getOrCreateSettings(attempt = 0): Promise<SettingsFields> {
    const syncSettings = await this.getSettings()
    if (syncSettings) return syncSettings

    const [newSyncSettings] = await this.db
      .insert(settings)
      .values({
        portalId: this.user.portalId,
        tenantId: this.connection.tenantId,
        // Default sync settings
        ...defaultSettings,
      })
      .onConflictDoNothing()
      .returning(this.settingsFields)

    if (newSyncSettings) return newSyncSettings

    if (attempt > this.MAX_RETRY_ATTEMPTS)
      throw new APIError('Failed to query settings for user', status.INTERNAL_SERVER_ERROR)

    return await this.getOrCreateSettings(attempt + 1)
  }

  async getSettings(): Promise<SettingsFields | undefined> {
    logger.info('SettingsService#getSettings :: Getting settings for portalId', this.user.portalId)
    const [syncSettings] = await this.db
      .select(this.settingsFields)
      .from(settings)
      .where(
        and(
          eq(settings.portalId, this.user.portalId),
          eq(settings.tenantId, this.connection.tenantId),
        ),
      )
    return syncSettings
  }

  async updateSettings(payload: Partial<SettingsFields>) {
    logger.info(
      'SettingsService#updateSettings :: Updating settings for portalId',
      this.user.portalId,
    )
    const [updatedSettings] = await this.db
      .update(settings)
      .set(payload)
      .where(
        and(
          eq(settings.portalId, this.user.portalId),
          eq(settings.tenantId, this.connection.tenantId),
        ),
      )
      .returning(this.settingsFields)
    return updatedSettings
  }
}

export default SettingsService
