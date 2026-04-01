'use client'

import type { ProductMapping } from '@items-sync/types'
import { ProductMappingTableRow } from '@settings/components/ProductMapping/ProductMappingTableRow'
import { Icon } from 'copilot-design-system'
import { useState } from 'react'

interface ProductMappingTableProps {
  items: ProductMapping[]
}

export const ProductMappingTable = ({ items }: ProductMappingTableProps) => {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)

  return (
    <div className="product-mapping-table mt-5 border border-gray-200 bg-white text-left">
      <table className="w-full">
        <thead>
          <tr className="border-gray-200 border-b">
            <th className="w-[46.5%] pt-5 pr-3 pb-2 pl-4 font-normal text-[11px] uppercase leading-3 tracking-[1px] lg:w-[372px]">
              ASSEMBLY SERVICES
            </th>

            <th className="w-[7%] border-gray-200 border-l px-5 pt-3 pb-[6px] lg:w-[56px]">
              <div className="flex w-full justify-center text-center">
                <Icon icon="ArrowRight" width={16} height={16} className="text-gray-500" />
              </div>
            </th>
            <th className="w-[46.5%] border-gray-200 border-l pt-5 pr-3 pb-2 pl-4 text-left font-normal text-[11px] uppercase leading-3 tracking-[1px] lg:w-[372px]">
              XERO ITEMS
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-200">
          {items.length ? (
            items.map((item) => (
              <ProductMappingTableRow
                key={item.price.id}
                item={item}
                openDropdownId={openDropdownId}
                setOpenDropdownId={setOpenDropdownId}
              />
            ))
          ) : (
            <tr className="text-center">
              <td colSpan={3} className="py-11 text-sm text-text-primary leading-[22px]">
                Start by creating a service in Assembly.
                <button
                  type="button"
                  onClick={() => null}
                  className="ms-2 cursor-pointer text-text-link"
                >
                  Create Service
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
