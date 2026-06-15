import type { Item } from 'xero-node'
import type { CopilotPrice, CopilotProduct } from '@/lib/copilot/types'

export type ProductMapping = {
  price: CopilotPrice
  product: CopilotProduct
  item?: (Pick<Item, 'itemID' | 'code' | 'name'> & { amount: number }) | null
}

export type Mappable = { productId: string; itemId: string | null }
