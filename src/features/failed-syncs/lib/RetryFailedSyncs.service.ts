import AuthService from '@auth/lib/Auth.service'
import { MAX_RETRY_ATTEMPTS } from '@failed-syncs/lib/constants'
import { ValidWebhookEvent } from '@invoice-sync/types'
import WebhookService from '@webhook/lib/webhook.service'
import { eq, lte } from 'drizzle-orm'
import env from '@/config/server.env'
import db from '@/db'
import { failedSyncs } from '@/db/schema/failedSyncs.schema'
import { CopilotAPI } from '@/lib/copilot/CopilotAPI'
import User from '@/lib/copilot/models/User.model'
import logger from '@/lib/logger'
import { encodePayload } from '@/utils/crypto'

class RetryFailedSyncsService {
  async retryFailedSyncs() {
    const failedSyncRecords = await db
      .select()
      .from(failedSyncs)
      .where(lte(failedSyncs.attempts, MAX_RETRY_ATTEMPTS))

    const tokenMap: Record<string, string> = {}
    for (const failedSync of failedSyncRecords) {
      try {
        logger.info('Retrying failed sync', failedSync.id)
        const token =
          tokenMap[failedSync.portalId] ||
          (() => {
            const newToken = encodePayload(env.COPILOT_API_KEY, {
              workspaceId: failedSync.portalId,
            })
            tokenMap[failedSync.portalId] = newToken
            return newToken
          })()

        const user = await User.authenticate(token)

        const authService = new AuthService(user)
        const connection = await authService.authorizeXeroForCopilotWorkspace()
        logger.info('Found connection', connection.id)

        const webhookService = new WebhookService(user, connection)

        // Resolve legacy price.created records as product.created via the payload's productId
        if (failedSync.type === ValidWebhookEvent.PriceCreated) {
          const { productId } = (failedSync.payload ?? {}) as { productId?: string }
          if (!productId) {
            logger.warn(
              'Legacy price.created failed sync has no productId, dropping',
              failedSync.id,
            )
            await db.delete(failedSyncs).where(eq(failedSyncs.id, failedSync.id))
            continue
          }

          const products = await new CopilotAPI(token).getProductsMapById([productId])
          const product = products[productId]
          if (!product) {
            logger.warn(
              'Legacy price.created failed sync references a product that no longer exists, dropping',
              failedSync.id,
              productId,
            )
            await db.delete(failedSyncs).where(eq(failedSyncs.id, failedSync.id))
            continue
          }

          // Delete only after a successful dispatch, like every other event — no row loss on failure
          await webhookService.handleEvent({
            eventType: ValidWebhookEvent.ProductCreated,
            data: { id: product.id, name: product.name, description: product.description },
          })
          await db.delete(failedSyncs).where(eq(failedSyncs.id, failedSync.id))
          continue
        }

        await webhookService.handleEvent({
          eventType: failedSync.type,
          // biome-ignore lint/suspicious/noExplicitAny: payload can literally be anything
          data: failedSync.payload as any,
        })
        await db.delete(failedSyncs).where(eq(failedSyncs.id, failedSync.id))
      } catch (_e: unknown) {
        // We don't have to increase the attempt number because FailedSyncsService will do that on failed sync by itself
      }
    }
  }
}

export default RetryFailedSyncsService
