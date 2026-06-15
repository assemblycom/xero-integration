import type { Item } from 'xero-node'
import type { CopilotProduct } from '@/lib/copilot/types'

export type ProductMapping = {
  product: CopilotProduct
  item?: Pick<Item, 'itemID' | 'code' | 'name'> | null
}

export type Mappable = { productId: string; itemId: string | null }
