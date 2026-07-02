import { type ProductCreatedWebhookSchema, ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_PRODUCT } from '@test/helpers/constants'
import type { z } from 'zod'

const productCreatedPayload: z.input<typeof ProductCreatedWebhookSchema> = {
  eventType: ValidWebhookEvent.ProductCreated,
  data: {
    id: TEST_PRODUCT.id,
    name: 'Test Product',
    description: 'A great test product',
  },
}

export default productCreatedPayload
