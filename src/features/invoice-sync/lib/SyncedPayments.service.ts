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

  async getExpenseByCopilotPaymentId(copilotPaymentId: string) {
    return await this.db.query.syncedPayments.findFirst({
      where: (t, { and, eq }) =>
        and(
          eq(t.portalId, this.user.portalId),
          eq(t.tenantId, this.connection.tenantId),
          eq(t.copilotPaymentId, copilotPaymentId),
          eq(t.type, PaymentUserType.EXPENSE),
        ),
    })
  }

  async createPaymentRecord(
    data: Pick<
      SyncedPayment,
      'copilotInvoiceId' | 'copilotPaymentId' | 'xeroInvoiceId' | 'xeroPaymentId'
    >,
    type?: PaymentUserType,
  ) {
    logger.info('SyncedPaymentsService#createPayment :: Creating payment for payload', data)

    // onConflictDoNothing guards the race: a parallel insert no-ops to [].
    return await this.db
      .insert(syncedPayments)
      .values({
        portalId: this.user.portalId,
        tenantId: this.connection.tenantId,
        ...data,
        type,
      })
      .onConflictDoNothing()
      .returning()
  }

  async createPlatformExpensePayment(
    data: PaymentSucceededEvent,
  ): Promise<BankTransaction | undefined> {
    const regionService = new RegionService(this.user, this.connection)
    const regionConfig = await regionService.getRegionConfig()
    if (!regionConfig) {
      // The webhook gate already skips unsupported regions, so null here means a bug.
      throw new APIError(
        'Cannot create platform expense payment: Xero region is not supported',
        status.INTERNAL_SERVER_ERROR,
      )
    }

    try {
      const existingExpense = await this.getExpenseByCopilotPaymentId(data.id)
      if (existingExpense) {
        logger.info(
          'SyncedPaymentsService#createPlatformExpensePayment :: Expense already synced for payment, skipping replay',
          data.id,
        )
        return undefined
      }

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

      const feeAmount = data.feeAmount.paidByPlatform / 100
      const xeroInvoiceId = z.string().parse(invoice.invoiceID)

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
            description: `Assembly Absorbed Fees (Invoice ${xeroInvoiceId})`,
            quantity: 1,
            unitAmount: feeAmount,
          },
        ],
        contact: {
          name: 'Assembly Processing Fees',
        },
        // Use the payment id as reference so we can find this expense later.
        reference: data.id,
      } satisfies BankTransaction

      // A retry may run after Xero's idempotency window, so look up the expense
      // and reuse it instead of making a duplicate. Fall back to the old
      // invoice-id reference for expenses created before this change.
      const transaction =
        (await this.xero.findBankTransactionByReference(this.connection.tenantId, data.id)) ??
        (await this.xero.findLegacyExpenseByInvoice(
          this.connection.tenantId,
          xeroInvoiceId,
          data.feeAmount.paidByPlatform,
        )) ??
        (await this.xero.createBankTransaction(
          this.connection.tenantId,
          transactionPayload,
          data.id,
        ))
      if (!transaction) {
        throw new APIError(
          'Failed to create a transaction for Expense account',
          status.INTERNAL_SERVER_ERROR,
        )
      }

      const inserted = await this.createPaymentRecord(
        {
          copilotInvoiceId: data.invoiceId,
          xeroInvoiceId,
          xeroPaymentId: z.string().parse(transaction.bankTransactionID),
          copilotPaymentId: data.id,
        },
        PaymentUserType.EXPENSE,
      )

      // Another delivery already recorded this expense, so skip the sync log.
      if (!inserted.length) {
        logger.info(
          'SyncedPaymentsService#createPlatformExpensePayment :: Concurrent duplicate detected on insert, skipping sync log. CopilotPaymentId: ',
          data.id,
          'xeroPaymentId: ',
          transaction.bankTransactionID,
        )
        return transaction
      }

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
