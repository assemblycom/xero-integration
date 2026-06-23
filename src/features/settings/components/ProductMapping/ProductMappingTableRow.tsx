import { useAuthContext } from '@auth/hooks/useAuth'
import type { ProductMapping } from '@items-sync/types'
import { useSettingsContext } from '@settings/hooks/useSettings'
import { Icon } from 'copilot-design-system'
import { SearchableSelectMenu } from '@/components/ui/SearchableSelectMenu'
import { formatCurrencyForRegion } from '@/lib/xero/region'
import type { ClientXeroItem } from '@/lib/xero/types'

interface ProductMappingTableRowProps {
  item: ProductMapping
  openDropdownId: string | null
  setOpenDropdownId: React.Dispatch<React.SetStateAction<string | null>>
}

export const ProductMappingTableRow = ({
  item,
  openDropdownId,
  setOpenDropdownId,
}: ProductMappingTableRowProps) => {
  const { productMappings, updateSettings, xeroItems, dropdownXeroItems } = useSettingsContext()
  const { countryCode } = useAuthContext()

  const xeroItem = xeroItems.find((i) => i.itemID === item.item?.itemID)
  const isOpen = item.product.id === openDropdownId

  const excludeItemFromMapping = () => {
    const newProductMappings = productMappings.map((mapping) =>
      mapping.product.id === item.product.id ? { ...mapping, item: null } : mapping,
    )
    updateSettings({ productMappings: newProductMappings })
  }

  const handleSelectMapping = (newItem: ClientXeroItem) => {
    const { itemID, name, code } = newItem
    const newProductMappings = productMappings.map((mapping) =>
      mapping.product.id === item.product.id
        ? { ...mapping, item: { itemID, name, code } }
        : mapping,
    )
    updateSettings({ productMappings: newProductMappings })
  }

  const renderCurrency = (amount: number) => formatCurrencyForRegion(amount, countryCode)

  return (
    <tr key={item.product.id} className="transition-colors">
      {/* Assembly Products Column */}
      <td className="py-2 pr-3 pl-4" id={`product-id-${item.product.id}`}>
        <div className="break-all text-sm text-text-primary leading-5 lg:break-normal">
          {item.product.name}
        </div>
      </td>

      {/* Arrow Column */}
      <td className="border-gray-200 border-l text-center">
        <Icon icon="ArrowRight" width={16} height={16} className="mx-auto text-gray-500" />
      </td>

      {/* Xero Items Column */}
      <td
        className="relative border-gray-200 border-l bg-gray-100 hover:bg-gray-150"
        id={`item-id-${xeroItem?.itemID || `unmapped-${crypto.randomUUID()}`}`}
        suppressHydrationWarning
      >
        <button
          type="button"
          onClick={() =>
            setOpenDropdownId((prev) => (prev === item.product.id ? null : item.product.id))
          }
          className="mapping-btn grid h-full w-full grid-cols-6 py-2 pr-3 pl-4 transition-colors md:grid-cols-14"
        >
          <div className="col-span-5 text-left md:col-span-13">
            {xeroItem ? (
              <div className="py-2.5 text-left">
                <div className="break-all text-sm text-text-primary leading-5 lg:break-normal">
                  {xeroItem.name}
                </div>
              </div>
            ) : (
              <div className="py-2">
                <Icon icon="Dash" width={16} height={16} className="text-gray-600" />
              </div>
            )}
          </div>
          <div className="col-span-1 my-auto ml-auto">
            <Icon icon="ChevronDown" width={16} height={16} className="text-gray-500" />
          </div>
        </button>

        {isOpen && (
          <SearchableSelectMenu
            onClose={() => setOpenDropdownId(null)}
            className="!shadow-[0_6px_20px_0_rgba(0,0,0,0.07)] absolute top-full right-[-1px] left-[-145px] z-100 mt-[-4px] rounded-sm border border-dropdown-border bg-white md:left-[-1px] md:min-w-[320px]"
            options={dropdownXeroItems}
            getOptionKey={(xero) => xero.itemID}
            getSearchValues={(xero) => [xero.name]}
            onSelect={handleSelectMapping}
            emptyText="No items found"
            action={{
              render: () => 'Exclude from mapping',
              onSelect: excludeItemFromMapping,
            }}
            renderOption={(xero) => (
              <>
                <span className="line-clamp-1 break-all text-text-primary lg:break-normal">
                  {xero.name}
                </span>
                <span className="ps-2 text-body-micro text-gray-500 leading-body-micro">
                  {renderCurrency(xero.amount)}
                </span>
              </>
            )}
          />
        )}
      </td>
    </tr>
  )
}
