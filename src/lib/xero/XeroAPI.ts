import 'server-only'

import status from 'http-status'
import {
  type Account,
  AccountType,
  type BankTransaction,
  type CountryCode,
  Invoice,
  type Item,
  type Payment,
  type TaxRate,
  type TokenSet,
  XeroClient,
} from 'xero-node'
import z from 'zod'
import env from '@/config/server.env'
import APIError from '@/errors/APIError'
import logger from '@/lib/logger'
import {
  AccountCode,
  ASSET_ACCOUNT_NAME,
  EXPENSE_ACCOUNT_NAME,
  SALES_ACCOUNT_NAME,
} from '@/lib/xero/constants'
import type {
  ContactCreatePayload,
  CreateInvoicePayload,
  ItemUpdatePayload,
  TaxRateCreatePayload,
  ValidContact,
} from '@/lib/xero/types'
import { getServerUrl } from '@/utils/serverUrl'
import { genRandomString } from '@/utils/string'

class XeroAPI {
  private readonly xero: XeroClient

  constructor() {
    this.xero = new XeroClient({
      clientId: env.XERO_CLIENT_ID,
      clientSecret: env.XERO_CLIENT_SECRET,
      redirectUris: [env.XERO_CALLBACK_URL],
      scopes: env.XERO_SCOPES.split(' '),
    })
  }

  /**
   * Build the consent URL to redirect users to Xero's authorization page
   * using Xero OAuth app's clientId, clientScret, redirectUri, and scopes
   */
  async buildConsentUrl(): Promise<string> {
    return await this.xero.buildConsentUrl()
  }

  /**
   * Refreshes a Xero access token with a set refresh token
   */
  async refreshWithRefreshToken(refreshToken: string): Promise<TokenSet> {
    return await this.xero.refreshWithRefreshToken(
      env.XERO_CLIENT_ID,
      env.XERO_CLIENT_SECRET,
      refreshToken,
    )
  }

  /**
   * Handle API callback from Xero and exchange the authorization code
   */
  async handleApiCallback(searchParams: {
    [key: string]: string | string[] | undefined
  }): ReturnType<XeroClient['apiCallback']> {
    try {
      const url = await getServerUrl('/auth/callback', await searchParams)
      const tokenSet = await this.xero.apiCallback(url)
      return tokenSet
    } catch (error) {
      logger.error('XeroAPI#handleApiCallback | Error during API callback:', error)
      throw error
    }
  }

  /**
   * Sets active tokenset for Xero SDK authorization
   * @param tokenSet
   */
  setTokenSet(tokenSet: TokenSet) {
    this.xero.setTokenSet(tokenSet)
  }

  /**
   * Gets the active (most recently connected) tenant (organization) for
   * @returns Active Tenant's tenantId
   */
  async getActiveTenantId(): Promise<string> {
    const connections = await this.xero.updateTenants(false) // Get an updated set of tenants
    return connections[0].tenantId
  }

  async getOrganisationCountryCode(tenantId: string): Promise<CountryCode | undefined> {
    const { body } = await this.xero.accountingApi.getOrganisations(tenantId)
    return body.organisations?.[0]?.countryCode
  }

  async getInvoiceById(tenantId: string, invoiceID: string): Promise<Invoice | undefined> {
    const { body } = await this.xero.accountingApi.getInvoice(tenantId, invoiceID)
    return body.invoices?.[0]
  }

  async createInvoice(
    tenantId: string,
    invoice: CreateInvoicePayload,
  ): Promise<Invoice | undefined> {
    // Ref: https://developer.xero.com/documentation/api/accounting/invoices#post-invoices
    const { body } = await this.xero.accountingApi.createInvoices(
      tenantId,
      { invoices: [invoice] },
      true,
    )
    return body.invoices?.[0]
  }

  async markInvoicePaid(
    tenantId: string,
    invoiceID: string,
    amount: number,
  ): Promise<Payment | undefined> {
    // Note: We can't just update the invoice status to "PAID", we need to create an actual payment for the invoice
    // Ref: https://developer.xero.com/documentation/api/accounting/payments#post-payments
    const { body } = await this.xero.accountingApi.createPayment(tenantId, {
      invoice: { invoiceID },
      code: 'ACCREC',
      account: { code: AccountCode.SALES },
      amount,
    })
    return body.payments?.[0]
  }

  async createExpensePayment(
    tenantId: string,
    invoiceID: string,
    account: Account,
    amount: number,
    details?: string,
  ): Promise<Payment | undefined> {
    // Note: We can't just update the invoice status to "PAID", we need to create an actual payment for the invoice
    // Ref: https://developer.xero.com/documentation/api/accounting/payments#post-payments
    const { body } = await this.xero.accountingApi.createPayment(tenantId, {
      code: 'ACCPAY',
      invoice: { invoiceID },
      account: {
        accountID: account.accountID,
        code: account.code,
        name: 'Assembly Payment Processing Fees',
      },
      amount,
      details,
    })
    return body.payments?.[0]
  }

  async voidInvoice(tenantId: string, invoiceID: string): Promise<Invoice | undefined> {
    const { body } = await this.xero.accountingApi.updateInvoice(tenantId, invoiceID, {
      invoices: [{ status: Invoice.StatusEnum.VOIDED }],
    })
    return body.invoices?.[0]
  }

  async deleteInvoice(tenantId: string, invoiceID: string): Promise<Invoice | undefined> {
    const { body } = await this.xero.accountingApi.updateInvoice(tenantId, invoiceID, {
      invoices: [{ status: Invoice.StatusEnum.DELETED }],
    })
    return body.invoices?.[0]
  }

  async getContact(tenantId: string, contactId: string): Promise<ValidContact | undefined> {
    const { body } = await this.xero.accountingApi.getContact(tenantId, contactId)
    const contact = body.contacts?.[0]
    if (contact) {
      return { ...contact, contactID: z.uuid().parse(contact.contactID) }
    }
  }

  async createContact(tenantId: string, contact: ContactCreatePayload): Promise<ValidContact> {
    const { body } = await this.xero.accountingApi.createContacts(
      tenantId,
      { contacts: [contact] },
      true,
    )
    const newContact = body.contacts?.[0]

    if (!newContact) throw new APIError('Unable to create contact', status.INTERNAL_SERVER_ERROR)

    return { ...newContact, contactID: z.uuid().parse(newContact.contactID) }
  }

  async updateContact(tenantId: string, contact: ValidContact): Promise<ValidContact> {
    const { body } = await this.xero.accountingApi.updateContact(tenantId, contact.contactID, {
      contacts: [contact],
    })
    const newContact = body.contacts?.[0]

    if (!newContact) throw new APIError('Unable to update contact', status.INTERNAL_SERVER_ERROR)

    return { ...newContact, contactID: z.uuid().parse(newContact.contactID) }
  }

  async getTaxRates(tenantId: string) {
    const { body } = await this.xero.accountingApi.getTaxRates(tenantId)
    return body.taxRates
  }

  async createTaxRate(tenantId: string, taxRate: TaxRateCreatePayload): Promise<TaxRate> {
    const { body } = await this.xero.accountingApi.createTaxRates(tenantId, { taxRates: [taxRate] })
    const newTaxRate = body.taxRates?.[0]

    if (!newTaxRate) throw new APIError('Unable to create taxRate', status.INTERNAL_SERVER_ERROR)
    return newTaxRate
  }

  async getItems(tenantId: string): Promise<Item[]> {
    const { body } = await this.xero.accountingApi.getItems(tenantId)
    return body.items || []
  }

  async getItemsMap(tenantId: string): Promise<Record<string, Item>> {
    const { body } = await this.xero.accountingApi.getItems(tenantId)
    const items = body.items || []

    return items.reduce<Record<string, Item>>((acc, item) => {
      acc[z.string().parse(item.itemID)] = item
      return acc
    }, {})
  }

  async createItems(tenantId: string, items: Item[]): Promise<Item[]> {
    if (!items.length) return []

    const { body } = await this.xero.accountingApi.createItems(tenantId, { items })
    return body.items || []
  }

  async updateItem(
    tenantId: string,
    itemID: string,
    item: ItemUpdatePayload & { code: Item['code'] },
  ): Promise<Item> {
    const { body } = await this.xero.accountingApi.updateItem(tenantId, itemID, { items: [item] })
    const updatedItem = body.items?.[0]
    if (!updatedItem) {
      throw new APIError('Unable to update item', status.INTERNAL_SERVER_ERROR)
    }
    return updatedItem
  }

  async deleteItem(tenantId: string, itemID: string): Promise<void> {
    await this.xero.accountingApi.deleteItem(tenantId, itemID)
  }

  async getAccounts(tenantId: string, type?: string): Promise<Account[]> {
    const { body } = await this.xero.accountingApi.getAccounts(
      tenantId,
      undefined,
      type ? `Type=="${type}"` : undefined, // Filter only for type accounts
    )
    // For any sane Xero tenant, the number of expense accounts should never reach even close to the pageSize
    return body.accounts || []
  }

  async enablePaymentsForAccount(tenantId: string, accountId: string) {
    await this.xero.accountingApi.updateAccount(tenantId, accountId, {
      accounts: [{ enablePaymentsToAccount: true }],
    })
  }

  async createFixedAssetsAccount(tenantId: string): Promise<Account | undefined> {
    const { body } = await this.xero.accountingApi.createAccount(tenantId, {
      name: ASSET_ACCOUNT_NAME,
      bankAccountNumber: genRandomString(10),
      code: AccountCode.BANK,
      type: AccountType.BANK,
      description: 'Asset account that is charged for Assembly processing fees',
    })
    return body.accounts?.[0]
  }

  async createSalesAccount(tenantId: string): Promise<Account | undefined> {
    const { body } = await this.xero.accountingApi.createAccount(tenantId, {
      name: SALES_ACCOUNT_NAME,
      code: AccountCode.SALES,
      type: AccountType.SALES,
      description: 'Revenue from selling goods or products.',
      enablePaymentsToAccount: true,
    })
    return body.accounts?.[0]
  }

  async createExpenseAccount(tenantId: string): Promise<Account | undefined> {
    const { body } = await this.xero.accountingApi.createAccount(tenantId, {
      name: EXPENSE_ACCOUNT_NAME,
      code: AccountCode.MERCHANT_FEES,
      type: AccountType.EXPENSE,
      description: 'Expense account that is charged for Assembly processing fees',
      enablePaymentsToAccount: true,
    })
    return body.accounts?.[0]
  }

  async createBankTransaction(tenantId: string, payload: BankTransaction) {
    const res = await this.xero.accountingApi.createBankTransactions(tenantId, {
      bankTransactions: [payload],
    })
    return res.body.bankTransactions?.[0]
  }

  async updateBankTransaction(
    tenantId: string,
    bankTransactionId: string,
    payload: BankTransaction,
  ) {
    const res = await this.xero.accountingApi.updateBankTransaction(tenantId, bankTransactionId, {
      bankTransactions: [payload],
    })
    return res.body.bankTransactions?.[0]
  }
}

export default XeroAPI
