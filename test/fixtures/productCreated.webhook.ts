import { type ProductCreatedWebhookSchema, ValidWebhookEvent } from '@invoice-sync/types'
import { TEST_PRODUCT_ID } from '@test/helpers/seed'
import type { z } from 'zod'

const productCreatedPayload: z.input<typeof ProductCreatedWebhookSchema> = {
  eventType: ValidWebhookEvent.ProductCreated,
  data: {
    id: TEST_PRODUCT_ID,
    name: 'Test Product',
    description: 'A great test product',
  },
}

export default productCreatedPayload
