import 'server-only'

import { Account } from 'xero-node'
import logger from '@/lib/logger'
import AuthenticatedXeroService from '@/lib/xero/AuthenticatedXero.service'
import { type ClientXeroAccounts, toClientXeroAccount } from '@/lib/xero/accounts'

/** Delivers the tenant's accounts to the settings UI, grouped by role. */
class XeroAccountsService extends AuthenticatedXeroService {
  async getClientXeroAccounts(): Promise<ClientXeroAccounts> {
    logger.info(
      'XeroAccountsService#getClientXeroAccounts :: Getting client xero accounts for portalId',
      this.user.portalId,
    )

    const accounts = await this.xero.getAccounts(this.connection.tenantId)

    const grouped: ClientXeroAccounts = {
      income: [],
      bank: [],
      expense: [],
      archivedAccountCodes: [],
    }
    for (const account of accounts) {
      const clientAccount = toClientXeroAccount(account)
      if (clientAccount) {
        grouped[clientAccount.category].push(clientAccount)
      } else if (account.code && account.status && account.status !== Account.StatusEnum.ACTIVE) {
        // Code reserved by an archived account; the UI blocks defaulting to it.
        grouped.archivedAccountCodes.push(account.code)
      }
    }
    return grouped
  }
}

export default XeroAccountsService
