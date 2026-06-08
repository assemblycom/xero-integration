import status from 'http-status'
import { type Account, AccountType } from 'xero-node'
import z from 'zod'
import APIError from '@/errors/APIError'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import type { RegionConfig } from '@/lib/xero/region'

// Account types Xero accepts on the relevant document. We only flag a conflict when the
// configured code is held by an account whose type genuinely can't back that transaction
// (e.g. a bank/expense account sitting on the sales code), not for equivalent income types.
const SALES_ACCOUNT_TYPES: AccountType[] = [
  AccountType.SALES,
  AccountType.REVENUE,
  AccountType.OTHERINCOME,
]
const EXPENSE_ACCOUNT_TYPES: AccountType[] = [
  AccountType.EXPENSE,
  AccountType.OVERHEADS,
  AccountType.DIRECTCOSTS,
]

class SyncedAccountsService extends AuthenticatedXeroService {
  private accountsPromise?: Promise<Account[]>

  // Fetch the tenant's accounts once per instance. Each getOrCreate* method targets a
  // distinct code, so they can share one list (and parallel callers share one request).
  private getAccounts(): Promise<Account[]> {
    this.accountsPromise ??= this.xero.getAccounts(this.connection.tenantId)
    return this.accountsPromise
  }

  async getOrCreateCopilotSalesAccount(regionConfig: RegionConfig): Promise<Account> {
    logger.info(
      'SyncedAccountsService#getOrCreateCopilotSalesAccount :: Getting copilot sales account',
    )

    const { sales: code } = regionConfig.accountCodes
    const accounts = await this.getAccounts()
    const existing = accounts.find((acc) => acc.code === code)

    // CASE I: The code is already taken by an account whose type can't back a sales invoice
    // line. Don't hijack it, and don't attempt to create (codes must be unique) — fail clearly.
    if (existing?.type && !SALES_ACCOUNT_TYPES.includes(existing.type)) {
      throw new APIError(
        `Xero account code ${code} is already used by a ${existing.type} account and cannot be used for the Assembly sales account`,
        status.CONFLICT,
      )
    }

    // CASE II: Sales account exists
    if (existing) {
      if (!existing.enablePaymentsToAccount) {
        // Sales account exists but payments are disabled
        await this.xero.enablePaymentsForAccount(
          this.connection.tenantId,
          z.string().parse(existing.accountID),
        )
      }
      logger.info(
        'SyncedAccountsService#getOrCreateCopilotSalesAccount :: Using existing sales account:',
        existing,
      )

      return existing
    }

    // CASE III: Sales account doesn't exist
    const salesAccount = await this.xero.createSalesAccount(this.connection.tenantId, {
      code,
      name: regionConfig.accountNames.sales,
    })
    if (!salesAccount) {
      throw new APIError(
        'Failed to create a new sales account in xero',
        status.INTERNAL_SERVER_ERROR,
      )
    }

    logger.info(
      'SyncedAccountsService#getOrCreateCopilotSalesAccount :: Created a new sales account:',
      salesAccount,
    )

    return salesAccount
  }

  async getOrCreateCopilotExpenseAccount(regionConfig: RegionConfig): Promise<Account> {
    logger.info(
      'SyncedAccountsService#getOrCreateCopilotExpenseAccount :: Getting copilot expense account',
    )

    const { merchantFees: code } = regionConfig.accountCodes
    const accounts = await this.getAccounts()
    const existing = accounts.find((acc) => acc.code === code)

    // CASE I: The code is already taken by an account whose type can't back an expense
    // (spend) line. Don't hijack it, and don't attempt to create — fail clearly.
    if (existing?.type && !EXPENSE_ACCOUNT_TYPES.includes(existing.type)) {
      throw new APIError(
        `Xero account code ${code} is already used by a ${existing.type} account and cannot be used for the Assembly expense account`,
        status.CONFLICT,
      )
    }

    // CASE II: Expense account exists
    if (existing) {
      if (!existing.enablePaymentsToAccount) {
        // Expense account exists but payments are disabled
        await this.xero.enablePaymentsForAccount(
          this.connection.tenantId,
          z.string().parse(existing.accountID),
        )
      }
      logger.info(
        'SyncedAccountsService#getOrCreateCopilotExpenseAccount :: Using existing expense account:',
        existing,
      )

      return existing
    }

    // CASE III: Expense account doesn't exist
    const expenseAccount = await this.xero.createExpenseAccount(this.connection.tenantId, {
      code,
      name: regionConfig.accountNames.expense,
    })
    if (!expenseAccount) {
      throw new APIError(
        'Failed to create a new expense account in xero',
        status.INTERNAL_SERVER_ERROR,
      )
    }

    logger.info(
      'SyncedAccountsService#getOrCreateCopilotExpenseAccount :: Created a new expense account:',
      expenseAccount,
    )

    return expenseAccount
  }

  async getOrCreateCopilotAssetAccount(regionConfig: RegionConfig): Promise<Account> {
    logger.info(
      'SyncedAccountsService#getOrCreateCopilotAssetAccount :: Getting copilot asset account',
    )

    const { bank: code } = regionConfig.accountCodes
    const accounts = await this.getAccounts()
    const existing = accounts.find((acc) => acc.code === code)

    // The code is already taken by a non-bank account — fail clearly rather than emit an
    // opaque duplicate-code error on create.
    if (existing && existing.type !== AccountType.BANK) {
      throw new APIError(
        `Xero account code ${code} is already used by a ${existing.type} account and cannot be used for the Assembly asset account`,
        status.CONFLICT,
      )
    }

    // NOTE: We don't have the 'enablePaymentsToAccount' prop in Bank type accounts
    let assetAccount = existing
    if (!assetAccount) {
      assetAccount = await this.xero.createFixedAssetsAccount(this.connection.tenantId, {
        code,
        name: regionConfig.accountNames.asset,
      })
      if (!assetAccount) {
        throw new APIError(
          'Failed to create a new asset account in xero',
          status.INTERNAL_SERVER_ERROR,
        )
      }

      logger.info(
        'SyncedAccountsService#getOrCreateCopilotAssetAccount :: Created a new asset account:',
        assetAccount,
      )
    }

    logger.info(
      'SyncedAccountsService#getOrCreateCopilotAssetAccount :: Using asset account:',
      assetAccount,
    )

    return assetAccount
  }
}

export default SyncedAccountsService
