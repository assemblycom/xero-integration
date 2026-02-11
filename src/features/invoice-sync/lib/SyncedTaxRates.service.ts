import 'server-only'

import { type TaxComponent, TaxRate } from 'xero-node'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import { type TaxRateCreatePayload, TaxRateCreatePayloadSchema } from '@/lib/xero/types'
import { areNumbersEqual } from '@/utils/number'

/**
 * Set of ReportTaxType values that represent OUTPUT (sales) tax types.
 * These are valid for applying to sales invoices across all Xero regions:
 * - OUTPUT: Standard sales tax (US) / GST on Income (AU)
 * - OUTPUT2: Secondary output tax (used in some regions)
 * - SALESOUTPUT: Explicit sales output designation
 * - CAPITALSALESOUTPUT: Capital sales output
 *
 * INPUT-prefixed types are for purchase taxes and must NOT be applied to invoices.
 */
const OUTPUT_TAX_TYPES = new Set<TaxRate.ReportTaxTypeEnum>([
  TaxRate.ReportTaxTypeEnum.OUTPUT,
  TaxRate.ReportTaxTypeEnum.OUTPUT2,
  TaxRate.ReportTaxTypeEnum.SALESOUTPUT,
  TaxRate.ReportTaxTypeEnum.CAPITALSALESOUTPUT,
  TaxRate.ReportTaxTypeEnum.USSALESTAX,
])

const isOutputTaxRate = (taxRate: TaxRate): boolean => {
  return taxRate.reportTaxType != null && OUTPUT_TAX_TYPES.has(taxRate.reportTaxType)
}

class SyncedTaxRatesService extends AuthenticatedXeroService {
  async getTaxRateForItem(effectiveRate: number) {
    logger.info(
      'SyncedTaxRatesService#getTaxRateForItem :: Getting tax rate for effective rate',
      effectiveRate,
    )

    const taxRates = await this.xero.getTaxRates(this.connection.tenantId)
    let matchingTaxRate = taxRates?.find(
      (t) => areNumbersEqual(t.effectiveRate, effectiveRate) && isOutputTaxRate(t),
    )

    if (!matchingTaxRate) {
      logger.info(
        'SyncedTaxRatesService#getTaxRateForItem :: Tax Rate not found... creating a new one',
      )
      const payload = {
        name: `Assembly Tax - ${effectiveRate}%`,
        taxComponents: [
          {
            name: `Assembly Tax ${effectiveRate}%`,
            rate: effectiveRate,
            isCompound: false,
            isNonRecoverable: false,
          } satisfies TaxComponent,
        ],
        reportTaxType: TaxRate.ReportTaxTypeEnum.OUTPUT,
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
