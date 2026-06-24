import 'server-only'

import status from 'http-status'
import {
  type Account,
  AccountType,
  BankTransaction,
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
import type {
  ContactCreatePayload,
  CreateInvoicePayload,
  ItemUpdatePayload,
  TaxRateCreatePayload,
  ValidContact,
} from '@/lib/xero/types'
import { getServerUrl } from '@/utils/serverUrl'
import { genRandomString } from '@/utils/string'

type AccountPropertyType = { code: string; name: string }

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
    salesAccountCode: string,
  ): Promise<Payment | undefined> {
    // Note: We can't just update the invoice status to "PAID", we need to create an actual payment for the invoice
    // Ref: https://developer.xero.com/documentation/api/accounting/payments#post-payments
    const { body } = await this.xero.accountingApi.createPayment(tenantId, {
      invoice: { invoiceID },
      code: 'ACCREC',
      account: { code: salesAccountCode },
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

  async createFixedAssetsAccount(
    tenantId: string,
    account: AccountPropertyType,
  ): Promise<Account | undefined> {
    const { body } = await this.xero.accountingApi.createAccount(tenantId, {
      name: account.name,
      bankAccountNumber: genRandomString(10),
      code: account.code,
      type: AccountType.BANK,
      description: 'Asset account that is charged for Assembly processing fees',
    })
    return body.accounts?.[0]
  }

  async createSalesAccount(
    tenantId: string,
    account: AccountPropertyType,
  ): Promise<Account | undefined> {
    const { body } = await this.xero.accountingApi.createAccount(tenantId, {
      name: account.name,
      code: account.code,
      type: AccountType.SALES,
      description: 'Revenue from selling goods or products.',
      enablePaymentsToAccount: true,
    })
    return body.accounts?.[0]
  }

  async createExpenseAccount(
    tenantId: string,
    account: AccountPropertyType,
  ): Promise<Account | undefined> {
    const { body } = await this.xero.accountingApi.createAccount(tenantId, {
      name: account.name,
      code: account.code,
      type: AccountType.EXPENSE,
      description: 'Expense account that is charged for Assembly processing fees',
      enablePaymentsToAccount: true,
    })
    return body.accounts?.[0]
  }

  async createBankTransaction(tenantId: string, payload: BankTransaction, idempotencyKey?: string) {
    const res = await this.xero.accountingApi.createBankTransactions(
      tenantId,
      { bankTransactions: [payload] },
      undefined, // summarizeErrors
      undefined, // unitdp
      idempotencyKey,
    )
    return res.body.bankTransactions?.[0]
  }

  async getBankTransactionsByReference(tenantId: string, reference: string) {
    const res = await this.xero.accountingApi.getBankTransactions(
      tenantId,
      undefined, // ifModifiedSince
      `Type=="SPEND" AND Reference=="${reference}"`,
    )
    return res.body.bankTransactions ?? []
  }

  async findBankTransactionByReference(tenantId: string, reference: string) {
    const transactions = await this.getBankTransactionsByReference(tenantId, reference)
    // Only reuse a live expense; a deleted one should be recreated.
    return transactions.find((tx) => tx.status === BankTransaction.StatusEnum.AUTHORISED)
  }

  async getBankTransaction(tenantId: string, bankTransactionId: string) {
    const res = await this.xero.accountingApi.getBankTransaction(tenantId, bankTransactionId)
    return res.body.bankTransactions?.[0]
  }

  deleteBankTransaction(tenantId: string, bankTransactionId: string) {
    // Delete by setting Status=DELETED. Cast since only status matters.
    const payload = {
      type: BankTransaction.TypeEnum.SPEND,
      status: BankTransaction.StatusEnum.DELETED,
    } as BankTransaction
    return this.updateBankTransaction(tenantId, bankTransactionId, payload)
  }

  // Old expenses used the invoice id as reference. Match on amount and only
  // adopt a unique result so we never pick the wrong payment's expense.
  async findLegacyExpenseByInvoice(
    tenantId: string,
    invoiceReference: string,
    amountInCents: number,
  ) {
    const candidateTxns = (
      await this.getBankTransactionsByReference(tenantId, invoiceReference)
    ).filter(
      (tx) =>
        tx.status === BankTransaction.StatusEnum.AUTHORISED &&
        typeof tx.total === 'number' &&
        Math.round(tx.total * 100) === amountInCents,
    )
    if (candidateTxns.length > 1)
      logger.warn('XeroAPI#findLegacyExpenseByInvoice :: Multiple legacy expenses match', {
        tenantId,
        invoiceReference,
        count: candidateTxns.length,
      })

    return candidateTxns[0]
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
