import SettingsService from '@settings/lib/Settings.service'
import status from 'http-status'
import { type Account, AccountType } from 'xero-node'
import z from 'zod'
import type { SettingsFields } from '@/db/schema/settings.schema'
import APIError from '@/errors/APIError'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import {
  BANK_ACCOUNT_TYPES,
  EXPENSE_ACCOUNT_TYPES,
  INCOME_ACCOUNT_TYPES,
} from '@/lib/xero/accounts'
import type { RegionConfig } from '@/lib/xero/region'

class SyncedAccountsService extends AuthenticatedXeroService {
  private accountsPromise?: Promise<Account[]>
  private settingsPromise?: Promise<SettingsFields>

  // Fetch the tenant's accounts once per instance. Each getOrCreate* method targets a
  // distinct code, so they can share one list (and parallel callers share one request).
  private getAccounts(): Promise<Account[]> {
    this.accountsPromise ??= this.xero.getAccounts(this.connection.tenantId)
    return this.accountsPromise
  }

  // Read settings once per instance so the three getOrCreate* methods share one query.
  private getSettings(): Promise<SettingsFields> {
    this.settingsPromise ??= new SettingsService(this.user, this.connection).getOrCreateSettings()
    return this.settingsPromise
  }

  // Resolves a user-selected account by AccountID. Returns null (caller falls back to the
  // region default) when nothing is selected or the selection no longer exists in Xero.
  // Throws CONFLICT when the selected account exists but can't back this transaction type.
  private async resolveSelectedAccount(
    selectedAccountId: string | null | undefined,
    allowedTypes: AccountType[],
    label: string,
  ): Promise<Account | null> {
    if (!selectedAccountId) return null

    const accounts = await this.getAccounts()
    const selected = accounts.find((acc) => acc.accountID === selectedAccountId)

    if (!selected) {
      logger.warn(
        `SyncedAccountsService#resolveSelectedAccount :: Selected ${label} account ${selectedAccountId} not found in Xero; falling back to region default`,
      )
      return null
    }

    if (selected.type && !allowedTypes.includes(selected.type)) {
      throw new APIError(
        `Selected Xero ${label} account is a ${selected.type} account and cannot be used for the Assembly ${label} account`,
        status.CONFLICT,
      )
    }

    return selected
  }

  // Resolves a user-selected account and readies it for use: enables payments when required
  // (sales/expense; bank accounts don't expose the flag). Returns null when there's no valid
  // selection, so the caller falls back to the region-default get-or-create path.
  private async getSelectedAccount(
    selectedAccountId: string | null | undefined,
    allowedTypes: AccountType[],
    label: string,
    enablePayments: boolean,
  ): Promise<Account | null> {
    const selected = await this.resolveSelectedAccount(selectedAccountId, allowedTypes, label)
    if (!selected) return null

    // Every consumer posts against the account's code, so a code-less selection is unusable.
    if (!selected.code) {
      throw new APIError(
        `Selected Xero ${label} account has no account code and cannot be used`,
        status.CONFLICT,
      )
    }

    if (enablePayments && !selected.enablePaymentsToAccount) {
      await this.xero.enablePaymentsForAccount(
        this.connection.tenantId,
        z.string().parse(selected.accountID),
      )
      // Keep the cached account coherent so a later resolve doesn't re-enable it.
      selected.enablePaymentsToAccount = true
    }

    logger.info(`SyncedAccountsService :: Using selected ${label} account:`, selected)
    return selected
  }

  async getOrCreateCopilotSalesAccount(regionConfig: RegionConfig): Promise<Account> {
    logger.info(
      'SyncedAccountsService#getOrCreateCopilotSalesAccount :: Getting copilot sales account',
    )

    const settings = await this.getSettings()
    const selected = await this.getSelectedAccount(
      settings.incomeAccountId,
      INCOME_ACCOUNT_TYPES,
      'sales',
      true,
    )
    if (selected) return selected

    const { sales: code } = regionConfig.accountCodes
    const accounts = await this.getAccounts()
    const existing = accounts.find((acc) => acc.code === code)

    // CASE I: The code is already taken by an account whose type can't back a sales invoice
    // line. Don't hijack it, and don't attempt to create (codes must be unique) — fail clearly.
    if (existing?.type && !INCOME_ACCOUNT_TYPES.includes(existing.type)) {
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

    const settings = await this.getSettings()
    const selected = await this.getSelectedAccount(
      settings.expenseAccountId,
      EXPENSE_ACCOUNT_TYPES,
      'expense',
      true,
    )
    if (selected) return selected

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

    const settings = await this.getSettings()
    const selected = await this.getSelectedAccount(
      settings.bankAccountId,
      BANK_ACCOUNT_TYPES,
      'asset',
      false,
    )
    if (selected) return selected

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
