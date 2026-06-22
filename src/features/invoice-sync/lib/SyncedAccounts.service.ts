import SettingsService from '@settings/lib/Settings.service'
import status from 'http-status'
import { Account, AccountType } from 'xero-node'
import z from 'zod'
import type { SettingsFields } from '@/db/schema/settings.schema'
import APIError from '@/errors/APIError'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import {
  type AssemblyAccountRole,
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
    label: AssemblyAccountRole,
  ): Promise<Account | null> {
    if (!selectedAccountId) return null

    const accounts = await this.getAccounts()
    const selectedAccount = accounts.find((acc) => acc.accountID === selectedAccountId)

    if (!selectedAccount) {
      logger.warn(
        `SyncedAccountsService#resolveSelectedAccount :: Selected ${label} account ${selectedAccountId} not found in Xero; falling back to region default`,
      )
      return null
    }

    // Archived/deleted accounts fail at the Xero API, so fall back like a missing one.
    if (selectedAccount.status !== Account.StatusEnum.ACTIVE) {
      logger.warn(
        `SyncedAccountsService#resolveSelectedAccount :: Selected ${label} account ${selectedAccountId} is ${selectedAccount.status} in Xero; falling back to region default`,
      )
      return null
    }

    if (selectedAccount.type && !allowedTypes.includes(selectedAccount.type)) {
      throw new APIError(
        `Selected Xero ${label} account is a ${selectedAccount.type} account and cannot be used for the Assembly ${label} account`,
        status.CONFLICT,
      )
    }

    return selectedAccount
  }

  // Resolves a user-selected account and readies it for use: enables payments when required
  // (sales/expense; bank accounts don't expose the flag). Returns null when there's no valid
  // selection, so the caller falls back to the region-default get-or-create path.
  private async getSelectedAccount({
    selectedAccountId,
    allowedTypes,
    label,
    enablePayments,
  }: {
    selectedAccountId: string | null | undefined
    allowedTypes: AccountType[]
    label: AssemblyAccountRole
    enablePayments: boolean
  }): Promise<Account | null> {
    const selectedAccount = await this.resolveSelectedAccount(
      selectedAccountId,
      allowedTypes,
      label,
    )
    if (!selectedAccount) return null

    // Every consumer posts against the account's code, so a code-less selection is unusable.
    if (!selectedAccount.code) {
      throw new APIError(
        `Selected Xero ${label} account has no account code and cannot be used`,
        status.CONFLICT,
      )
    }

    if (enablePayments && !selectedAccount.enablePaymentsToAccount) {
      await this.xero.enablePaymentsForAccount(
        this.connection.tenantId,
        z.string().parse(selectedAccount.accountID),
      )
      // Keep the cached account coherent so a later resolve doesn't re-enable it.
      selectedAccount.enablePaymentsToAccount = true
    }

    logger.info(`SyncedAccountsService :: Using selected ${label} account:`, selectedAccount)
    return selectedAccount
  }

  // An archived account still reserves its code, so it can't be reused or recreated.
  private assertActiveDefaultAccount({
    existing,
    code,
    label,
  }: {
    existing: Account | undefined
    code: string
    label: AssemblyAccountRole
  }): void {
    if (existing && existing.status !== Account.StatusEnum.ACTIVE) {
      throw new APIError(
        `Xero account code ${code} is held by a ${existing.status} account in Xero and cannot be used for the Assembly ${label} account`,
        status.CONFLICT,
      )
    }
  }

  // Resolve the invoice's stored sales account so the payment hits the same account. Null
  // (→ region-default fallback) when missing/archived; throws on a type/code mismatch.
  getSalesAccountById(selectedAccountId: string | null | undefined): Promise<Account | null> {
    return this.getSelectedAccount({
      selectedAccountId,
      allowedTypes: INCOME_ACCOUNT_TYPES,
      label: 'sales',
      enablePayments: true,
    })
  }

  async getOrCreateCopilotSalesAccount(regionConfig: RegionConfig): Promise<Account> {
    logger.info(
      'SyncedAccountsService#getOrCreateCopilotSalesAccount :: Getting copilot sales account',
    )

    const settings = await this.getSettings()
    const selectedAccount = await this.getSelectedAccount({
      selectedAccountId: settings.incomeAccountId,
      allowedTypes: INCOME_ACCOUNT_TYPES,
      label: 'sales',
      enablePayments: true,
    })
    if (selectedAccount) return selectedAccount

    const { sales: code } = regionConfig.accountCodes
    const accounts = await this.getAccounts()
    const existing = accounts.find((acc) => acc.code === code)
    this.assertActiveDefaultAccount({ existing, code, label: 'sales' })

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
    const selectedAccount = await this.getSelectedAccount({
      selectedAccountId: settings.expenseAccountId,
      allowedTypes: EXPENSE_ACCOUNT_TYPES,
      label: 'expense',
      enablePayments: true,
    })
    if (selectedAccount) return selectedAccount

    const { merchantFees: code } = regionConfig.accountCodes
    const accounts = await this.getAccounts()
    const existing = accounts.find((acc) => acc.code === code)
    this.assertActiveDefaultAccount({ existing, code, label: 'expense' })

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
    const selectedAccount = await this.getSelectedAccount({
      selectedAccountId: settings.bankAccountId,
      allowedTypes: BANK_ACCOUNT_TYPES,
      label: 'bank',
      enablePayments: false,
    })
    if (selectedAccount) return selectedAccount

    const { bank: code } = regionConfig.accountCodes
    const accounts = await this.getAccounts()
    const existing = accounts.find((acc) => acc.code === code)
    this.assertActiveDefaultAccount({ existing, code, label: 'bank' })

    // The code is already taken by a non-bank account — fail clearly rather than emit an
    // opaque duplicate-code error on create.
    if (existing && existing.type !== AccountType.BANK) {
      throw new APIError(
        `Xero account code ${code} is already used by a ${existing.type} account and cannot be used for the Assembly bank account`,
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
