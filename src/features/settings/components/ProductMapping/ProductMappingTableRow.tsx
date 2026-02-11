import type { ProductMapping } from '@items-sync/types'
import { useDropdown } from '@settings/hooks/useDropdown'
import { useSettingsContext } from '@settings/hooks/useSettings'
import { Icon } from 'copilot-design-system'
import { useEffect, useRef, useState } from 'react'
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
  const { dropdownRef } = useDropdown({ setOpenDropdownId })
  const { productMappings, updateSettings, xeroItems, dropdownXeroItems } = useSettingsContext()

  const xeroItem = xeroItems.find((i) => i.itemID === item.item?.itemID)

  const [searchQuery, setSearchQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  const filteredItems = dropdownXeroItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: To set focused index
  useEffect(() => {
    setFocusedIndex(-1)
  }, [searchQuery])

  useEffect(() => {
    if (openDropdownId === null) {
      setSearchQuery('')
    }
  }, [openDropdownId])

  useEffect(() => {
    if (listRef.current && filteredItems.length > 0) {
      const focusedElement = listRef.current.children[focusedIndex] as HTMLElement
      if (focusedElement) {
        focusedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [focusedIndex, filteredItems.length])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((prev) => (prev === -1 ? 0 : Math.min(prev + 1, filteredItems.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((prev) => (prev === -1 ? filteredItems.length - 1 : Math.max(prev - 1, 0)))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredItems[focusedIndex]) {
        handleSelectMapping(filteredItems[focusedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpenDropdownId(null)
    }
  }

  const excludeItemFromMapping = () => {
    const newProductMappings = productMappings.map((m) => {
      if (m.price.id === item.price.id) {
        return { ...m, item: null }
      }
      return m
    })
    updateSettings({ productMappings: newProductMappings })
    setOpenDropdownId(null)
  }

  const handleSelectMapping = (newItem: ClientXeroItem) => {
    const { itemID, name, code, amount } = newItem
    const newProductMappings = productMappings.map((mapping) => {
      if (mapping.price.id === item.price.id) {
        return {
          ...mapping,
          item: { itemID, name, code, amount },
        }
      }
      return mapping
    })
    updateSettings({ productMappings: newProductMappings })
    setOpenDropdownId(null)
  }

  const currencyCode = item.price.currency || 'USD'
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
    }).format(amount || 0)

  return (
    <tr key={item.price.id} className="transition-colors">
      {/* Assembly Products Column */}
      <td className="py-2 pr-3 pl-4" id={`price-id-${item.price.id}`}>
        <div className="break-all text-sm text-text-primary leading-5 lg:break-normal">
          {item.product.name}
        </div>
        <div className="text-body-xs text-text-secondary leading-5">
          {formatCurrency(item.price.amount / 100)}
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
            setOpenDropdownId((prev) => (prev === item.price.id ? null : item.price.id))
          }
          className="mapping-btn grid h-full w-full grid-cols-6 py-2 pr-3 pl-4 transition-colors md:grid-cols-14"
        >
          <div className="col-span-5 text-left md:col-span-13">
            {xeroItem ? (
              <div className="text-left">
                <div className="break-all text-sm text-text-primary leading-5 lg:break-normal">
                  {xeroItem.name}
                </div>
                <div className="text-body-xs text-text-secondary leading-5">
                  {formatCurrency(xeroItem.amount)}
                </div>
              </div>
            ) : (
              <div className="py-2">
                <Icon icon="Dash" width={16} height={16} className="text-gray-600" />
              </div>
            )}
          </div>
          <div className="col-span-1 my-auto ml-auto">
            <Icon icon="ChevronDown" width={16} height={16} className={`text-gray-500`} />
          </div>
        </button>

        {/* Dropdown */}
        {item.price.id === openDropdownId && (
          <div
            ref={dropdownRef}
            className="items-dropdown !shadow-[0_6px_20px_0_rgba(0,0,0,0.07)] absolute top-full right-[-1px] left-[-145px] z-100 mt-[-4px] rounded-sm border border-dropdown-border bg-white md:left-[-1px] md:min-w-[320px]"
          >
            <div className="px-3 py-2">
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                // biome-ignore lint/a11y/noAutofocus: Can't be bothered to change this atm
                autoFocus
                className="w-full text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>

            <div className="border-card-divider border-t-1 border-b-1 hover:bg-gray-100">
              <button
                type="button"
                className="h-full w-full cursor-pointer px-3 py-2 text-left text-sm text-text-primary"
                onClick={excludeItemFromMapping}
              >
                Exclude from mapping
              </button>
            </div>

            {/* Dropdown options */}
            <div className="max-h-56 overflow-y-auto" ref={listRef}>
              {filteredItems?.length
                ? Object.values(filteredItems).map((item, index) => (
                    <button
                      type="button"
                      key={item.itemID}
                      onClick={() => handleSelectMapping(item)}
                      className={`mapping-option-btn flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-gray-100 ${
                        index === focusedIndex ? 'bg-gray-100' : ''
                      }`}
                    >
                      <span className="line-clamp-1 break-all text-text-primary lg:break-normal">
                        {item.name}
                      </span>
                      <span className="ps-2 text-body-micro text-gray-500 leading-body-micro">
                        {formatCurrency(item.amount)}
                      </span>
                    </button>
                  ))
                : ''}
              {filteredItems.length === 0 && (
                <div className="px-3 py-2 text-gray-500 text-sm">No items found</div>
              )}
            </div>
          </div>
        )}
      </td>
    </tr>
  )
}
