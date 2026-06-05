import SyncedAccountsService from '@invoice-sync/lib/SyncedAccounts.service'
import SyncedInvoicesService from '@invoice-sync/lib/SyncedInvoices.service'
import type { PaymentSucceededEvent } from '@invoice-sync/types'
import { SyncLogsService } from '@sync-logs/lib/SyncLogs.service'
import dayjs from 'dayjs'
import { and, eq } from 'drizzle-orm'
import status from 'http-status'
import { BankTransaction } from 'xero-node'
import z from 'zod'
import {
  PaymentUserType,
  type SyncedPayment,
  syncedPayments,
} from '@/db/schema/syncedPayments.schema'
import { SyncEntityType, SyncEventType, SyncStatus } from '@/db/schema/syncLogs.schema'
import APIError from '@/errors/APIError'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import RegionService from '@/lib/xero/Region.service'

class SyncedPaymentsService extends AuthenticatedXeroService {
  async getPaymentForInvoiceId(copilotInvoiceId: string) {
    logger.info(
      'SyncedPaymentsService#createPayment :: Getting payment data from db for',
      copilotInvoiceId,
    )

    const results = await this.db
      .select()
      .from(syncedPayments)
      .where(
        and(
          eq(syncedPayments.portalId, this.user.portalId),
          eq(syncedPayments.tenantId, this.connection.tenantId),
          eq(syncedPayments.copilotInvoiceId, copilotInvoiceId),
          eq(syncedPayments.type, PaymentUserType.PAYMENT),
        ),
      )
    logger.info('SyncedPaymentsService#getPaymentForInvoiceId :: Fetched payment', results[0])

    return results.length ? results[0] : undefined
  }

  async createPaymentRecord(
    data: Pick<
      SyncedPayment,
      'copilotInvoiceId' | 'copilotPaymentId' | 'xeroInvoiceId' | 'xeroPaymentId'
    >,
    type?: PaymentUserType,
  ) {
    logger.info('SyncedPaymentsService#createPayment :: Creating payment for payload', data)

    await this.db.insert(syncedPayments).values({
      portalId: this.user.portalId,
      tenantId: this.connection.tenantId,
      ...data,
      type,
    })
  }

  async createPlatformExpensePayment(data: PaymentSucceededEvent): Promise<BankTransaction> {
    const regionService = new RegionService(this.user, this.connection)
    const regionConfig = await regionService.getRegionConfig()

    try {
      logger.info(
        'SyncedPaymentsService#createPlatformExpensePayment :: Creating platform expense payment for',
      )

      const invoicesService = new SyncedInvoicesService(this.user, this.connection)
      const { invoice } = await invoicesService.getValidatedInvoiceRecord(data.invoiceId)

      const accountsService = new SyncedAccountsService(this.user, this.connection)
      const [assetAccount, expenseAccount] = await Promise.all([
        accountsService.getOrCreateCopilotAssetAccount(regionConfig),
        accountsService.getOrCreateCopilotExpenseAccount(regionConfig),
      ])

      // Create an expense invoice
      const transactionPayload = {
        type: BankTransaction.TypeEnum.SPEND,
        date: dayjs().format('YYYY-MM-DD'),
        bankAccount: {
          code: assetAccount.code,
        },
        lineItems: [
          {
            accountCode: expenseAccount.code,
            description: 'Assembly Absorbed Fees',
            quantity: 1,
            unitAmount: data.feeAmount.paidByPlatform / 100,
          },
        ],
        contact: {
          name: 'Assembly Processing Fees',
        },
        reference: invoice.invoiceID,
      } satisfies BankTransaction

      const transaction = await this.xero.createBankTransaction(
        this.connection.tenantId,
        transactionPayload,
      )
      if (!transaction) {
        throw new APIError(
          'Failed to create a transaction for Expense account',
          status.INTERNAL_SERVER_ERROR,
        )
      }

      // Log payment to DB as an expense
      await this.createPaymentRecord(
        {
          copilotInvoiceId: data.invoiceId,
          xeroInvoiceId: z.string().parse(invoice.invoiceID),
          xeroPaymentId: z.string().parse(transaction.bankTransactionID),
          copilotPaymentId: data.id,
        },
        PaymentUserType.EXPENSE,
      )

      logger.info(
        'SyncedPaymentsService#createPlatformExpensePayment :: Created platform expense payment',
        transaction.bankTransactionID,
      )

      const syncLogsService = new SyncLogsService(this.user, this.connection)
      await syncLogsService.createSyncLog({
        entityType: SyncEntityType.EXPENSE,
        eventType: SyncEventType.CREATED,
        status: SyncStatus.SUCCESS,
        syncDate: new Date(),
        copilotId: data.invoiceId,
        xeroId: transaction.bankTransactionID,
        amount: String(data.feeAmount.paidByPlatform / 100),
        feeAmount: String(data.feeAmount.paidByPlatform / 100),
      })

      return transaction
    } catch (error: unknown) {
      throw new APIError(
        'Failed to create platform expense payment',
        status.INTERNAL_SERVER_ERROR,
        {
          error,
          failedSyncLogPayload: {
            entityType: SyncEntityType.EXPENSE,
            eventType: SyncEventType.CREATED,
            copilotId: data.invoiceId,
            amount: String(data.feeAmount.paidByPlatform / 100),
            feeAmount: String(data.feeAmount.paidByPlatform / 100),
          },
        },
      )
    }
  }
}

export default SyncedPaymentsService
