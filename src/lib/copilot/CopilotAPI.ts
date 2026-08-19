import 'server-only'

import { assemblyApi, type AssemblyAPI as SDK } from '@assembly-js/node-sdk'
import { type InvoiceCreatedEvent, InvoiceCreatedEventSchema } from '@invoice-sync/types'
import z from 'zod'
import env from '@/config/server.env'
import { MAX_FETCH_COPILOT_RESOURCES } from '@/constants/limits'
import {
  type ClientRequest,
  type ClientResponse,
  ClientResponseSchema,
  ClientsResponseSchema,
  type CompaniesResponse,
  CompaniesResponseSchema,
  type CompanyCreateRequest,
  type CompanyResponse,
  CompanyResponseSchema,
  type CopilotListArgs,
  type CopilotPrice,
  CopilotPriceSchema,
  type CopilotProduct,
  CopilotProductSchema,
  type InternalUser,
  InternalUserSchema,
  type InternalUsersResponse,
  InternalUsersResponseSchema,
  type NotificationCreatedResponse,
  NotificationCreatedResponseSchema,
  type NotificationRequestBody,
  type WorkspaceResponse,
  WorkspaceResponseSchema,
} from '@/lib/copilot/types'
import { withRetry } from '@/lib/copilot/withRetry'
import logger from '@/lib/logger'

export class CopilotAPI {
  private sdkPromise?: Promise<SDK>

  constructor(private readonly workspaceId: string) {}

  // Made on first use, reused after. Scoped by workspace key with no request
  // token: the token expires mid-run and breaks long syncs; the key does not.
  private get sdk(): Promise<SDK> {
    this.sdkPromise ??= assemblyApi({ apiKey: `${this.workspaceId}/${env.COPILOT_API_KEY}` })
    return this.sdkPromise
  }

  // NOTE: Any method prefixed with _ is a API method that doesn't implement retry & delay
  // NOTE: Any normal API method name implements `withRetry` with default config

  async _getWorkspace(): Promise<WorkspaceResponse> {
    logger.info('CopilotAPI#_getWorkspace')
    const sdk = await this.sdk
    return WorkspaceResponseSchema.parse(await sdk.retrieveWorkspace())
  }

  async _createClient(
    requestBody: ClientRequest,
    sendInvite: boolean = false,
  ): Promise<ClientResponse> {
    logger.info('CopilotAPI#_createClient', requestBody, sendInvite)
    const sdk = await this.sdk
    return ClientResponseSchema.parse(await sdk.createClient({ sendInvite, requestBody }))
  }

  async _getClient(id: string): Promise<ClientResponse> {
    logger.info('CopilotAPI#_getClient', id)
    const sdk = await this.sdk
    return ClientResponseSchema.parse(await sdk.retrieveClient({ id }))
  }

  async _getClients(args: CopilotListArgs & { companyId?: string } = {}) {
    logger.info('CopilotAPI#_getClients', args)
    const sdk = await this.sdk
    return ClientsResponseSchema.parse(await sdk.listClients(args))
  }

  async _updateClient(id: string, requestBody: ClientRequest): Promise<ClientResponse> {
    logger.info('CopilotAPI#_updateClient', id)
    const sdk = await this.sdk
    return ClientResponseSchema.parse(await sdk.updateClient({ id, requestBody }))
  }

  async _deleteClient(id: string) {
    logger.info('CopilotAPI#_deleteClient', id)
    const sdk = await this.sdk
    return await sdk.deleteClient({ id })
  }

  async _createCompany(requestBody: CompanyCreateRequest) {
    logger.info('CopilotAPI#_createCompany', requestBody)
    const sdk = await this.sdk
    return CompanyResponseSchema.parse(await sdk.createCompany({ requestBody }))
  }

  async _getCompany(id: string): Promise<CompanyResponse> {
    logger.info('CopilotAPI#_getCompany', id)
    const sdk = await this.sdk
    return CompanyResponseSchema.parse(await sdk.retrieveCompany({ id }))
  }

  async _getCompanies(
    args: CopilotListArgs & { isPlaceholder?: boolean } = {},
  ): Promise<CompaniesResponse> {
    logger.info('CopilotAPI#_getCompanies', args)
    const sdk = await this.sdk
    return CompaniesResponseSchema.parse(await sdk.listCompanies(args))
  }

  async _getCompanyClients(companyId: string): Promise<ClientResponse[]> {
    logger.info('CopilotAPI#_getCompanyClients', companyId)
    return (await this.getClients({ limit: 10000, companyId })).data || []
  }

  async _getInternalUsers(args: CopilotListArgs = {}): Promise<InternalUsersResponse> {
    logger.info('CopilotAPI#_getInternalUsers', args)
    const sdk = await this.sdk
    return InternalUsersResponseSchema.parse(await sdk.listInternalUsers(args))
  }

  async _getInternalUser(id: string): Promise<InternalUser> {
    logger.info('CopilotAPI#_getInternalUser', id)
    const sdk = await this.sdk
    return InternalUserSchema.parse(await sdk.retrieveInternalUser({ id }))
  }

  async _createNotification(
    requestBody: NotificationRequestBody,
  ): Promise<NotificationCreatedResponse> {
    logger.info('CopilotAPI#_createNotification', requestBody)
    const sdk = await this.sdk
    const notification = await sdk.createNotification({ requestBody })
    return NotificationCreatedResponseSchema.parse(notification)
  }

  /**
   * Returns an object with product ID as key and product as value
   * @param productIds Products to get details for
   */
  async _getProducts(
    productIds: string[] | 'all',
    args: CopilotListArgs = { limit: MAX_FETCH_COPILOT_RESOURCES },
  ): Promise<Record<string, CopilotProduct>> {
    const sdk = await this.sdk
    const allProductsResponse = await sdk.listProducts(args)

    if (!allProductsResponse.data) return {}
    const allProducts = z.array(CopilotProductSchema).parse(allProductsResponse.data)

    return allProducts.reduce<Record<string, CopilotProduct>>((acc, product) => {
      if (productIds === 'all' || productIds.includes(product.id)) {
        acc[product.id] = product
      }
      return acc
    }, {})
  }

  /**
   * Returns an object with price ID as key and price as value
   * @param priceIds Prices to get details for
   */
  async _getPrices(
    priceIds: string[] | 'all',
    args = { limit: 10_000 },
  ): Promise<Record<string, CopilotPrice>> {
    const sdk = await this.sdk
    const allPricesResponse = await sdk.listPrices(args)

    if (!allPricesResponse.data) return {}
    const allPrices = z.array(CopilotPriceSchema).parse(allPricesResponse.data)

    return allPrices.reduce<Record<string, CopilotPrice>>((acc, price) => {
      if (priceIds === 'all' || priceIds.includes(price.id)) {
        acc[price.id] = price
      }
      return acc
    }, {})
  }

  /**
   * Returns an invoice from Copilot
   * @param copilotInvoiceId ID of the invoice in Copilot
   */
  async _getInvoice(copilotInvoiceId: string): Promise<InvoiceCreatedEvent> {
    logger.info('CopilotAPI#_getInvoice', copilotInvoiceId)
    const sdk = await this.sdk
    return InvoiceCreatedEventSchema.parse(await sdk.retrieveInvoice({ id: copilotInvoiceId }))
  }

  private wrapWithRetry<Args extends unknown[], R>(
    fn: (...args: Args) => Promise<R>,
  ): (...args: Args) => Promise<R> {
    return (...args: Args): Promise<R> => withRetry(fn.bind(this), args)
  }

  // Methods wrapped with retry
  getWorkspace = this.wrapWithRetry(this._getWorkspace)
  createClient = this.wrapWithRetry(this._createClient)
  getClient = this.wrapWithRetry(this._getClient)
  getClients = this.wrapWithRetry(this._getClients)
  updateClient = this.wrapWithRetry(this._updateClient)
  deleteClient = this.wrapWithRetry(this._deleteClient)
  createCompany = this.wrapWithRetry(this._createCompany)
  getCompany = this.wrapWithRetry(this._getCompany)
  getCompanies = this.wrapWithRetry(this._getCompanies)
  getCompanyClients = this.wrapWithRetry(this._getCompanyClients)
  getInternalUsers = this.wrapWithRetry(this._getInternalUsers)
  getInternalUser = this.wrapWithRetry(this._getInternalUser)
  createNotification = this.wrapWithRetry(this._createNotification)
  getProductsMapById = this.wrapWithRetry(this._getProducts)
  getPricesMapById = this.wrapWithRetry(this._getPrices)
  getInvoice = this.wrapWithRetry(this._getInvoice)
}
