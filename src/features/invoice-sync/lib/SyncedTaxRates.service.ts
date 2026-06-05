import 'server-only'

import { type TaxComponent, TaxRate } from 'xero-node'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import type { RegionConfig } from '@/lib/xero/region'
import { type TaxRateCreatePayload, TaxRateCreatePayloadSchema } from '@/lib/xero/types'
import { areNumbersEqual } from '@/utils/number'

class SyncedTaxRatesService extends AuthenticatedXeroService {
  async getTaxRateForItem(effectiveRate: number, regionConfig: RegionConfig) {
    logger.info(
      'SyncedTaxRatesService#getTaxRateForItem :: Getting tax rate for effective rate',
      effectiveRate,
    )

    const taxRates = await this.xero.getTaxRates(this.connection.tenantId)
    let matchingTaxRate = taxRates?.find((t) => areNumbersEqual(t.effectiveRate, effectiveRate))

    if (!matchingTaxRate) {
      logger.info(
        'SyncedTaxRatesService#getTaxRateForItem :: Tax Rate not found... creating a new one',
      )
      const payload = {
        name: `Assembly ${regionConfig.tax.label} - ${effectiveRate}%`,
        taxComponents: [
          {
            name: `Assembly ${regionConfig.tax.label} ${effectiveRate}%`,
            rate: effectiveRate,
            isCompound: false,
            isNonRecoverable: false,
          } satisfies TaxComponent,
        ],
        reportTaxType: regionConfig.tax.reportTaxType as TaxRateCreatePayload['reportTaxType'],
        status: TaxRate.StatusEnum.ACTIVE,
      } satisfies TaxRateCreatePayload

      matchingTaxRate = await this.xero.createTaxRate(
        this.connection.tenantId,
        TaxRateCreatePayloadSchema.parse(payload),
      )
    }
    return matchingTaxRate
  }
}

export default SyncedTaxRatesService
