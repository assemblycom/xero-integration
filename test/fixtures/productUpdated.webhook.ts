import { type ProductUpdatedWebhookSchema, ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_PRODUCT } from '@test/helpers/constants'
import type { z } from 'zod'

// description carries inline HTML so the happy path proves htmlToText runs
// before the payload reaches Xero.
const productUpdatedPayload: z.input<typeof ProductUpdatedWebhookSchema> = {
  eventType: ValidWebhookEvent.ProductUpdated,
  data: {
    id: TEST_PRODUCT.id,
    name: 'Updated Product',
    description: 'Updated <b>description</b> here',
  },
}

export default productUpdatedPayload
