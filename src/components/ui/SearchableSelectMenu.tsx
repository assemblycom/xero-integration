import { useDropdown } from '@settings/hooks/useDropdown'
import { type ReactNode, useEffect, useRef, useState } from 'react'

// Focus index for the optional action row. -1 = none, 0.. = options.
const ACTION_INDEX = -2

interface SearchableSelectMenuProps<T> {
  onClose: () => void
  className?: string
  searchPlaceholder?: string
  options: T[]
  getOptionKey: (option: T) => string
  getSearchText: (option: T) => string
  renderOption: (option: T) => ReactNode
  onSelect: (option: T) => void
  emptyText: string
  action?: {
    render: () => ReactNode
    onSelect: () => void
  }
}

export const SearchableSelectMenu = <T,>({
  onClose,
  className,
  searchPlaceholder = 'Search',
  options,
  getOptionKey,
  getSearchText,
  renderOption,
  onSelect,
  emptyText,
  action,
}: SearchableSelectMenuProps<T>) => {
  const { dropdownRef } = useDropdown({ setOpenDropdownId: onClose })
  const [searchQuery, setSearchQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  const query = searchQuery.toLowerCase()
  const filtered = options.filter((option) => getSearchText(option).toLowerCase().includes(query))

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset focus when query changes
  useEffect(() => {
    setFocusedIndex(-1)
  }, [searchQuery])

  useEffect(() => {
    // Only option rows live in the scrollable list.
    if (focusedIndex < 0 || !listRef.current) return
    const focusedElement = listRef.current.children[focusedIndex] as HTMLElement | undefined
    focusedElement?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex])

  const selectOption = (option: T) => {
    onSelect(option)
    onClose()
  }

  const selectAction = () => {
    action?.onSelect()
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const lastIndex = filtered.length - 1
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((prev) => {
        // From the top, hit the action row first when present.
        if (prev === -1) {
          if (action) return ACTION_INDEX
          return lastIndex >= 0 ? 0 : -1
        }
        if (prev === ACTION_INDEX) return lastIndex >= 0 ? 0 : ACTION_INDEX
        return Math.min(prev + 1, lastIndex)
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((prev) => {
        if (prev === -1) return lastIndex >= 0 ? lastIndex : action ? ACTION_INDEX : -1
        if (prev === 0) return action ? ACTION_INDEX : 0
        // Action row is the top; no wrap.
        if (prev === ACTION_INDEX) return ACTION_INDEX
        return Math.max(prev - 1, 0)
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIndex === ACTION_INDEX) selectAction()
      else if (filtered[focusedIndex]) selectOption(filtered[focusedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div ref={dropdownRef} className={className}>
      <div className="px-3 py-2">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          // biome-ignore lint/a11y/noAutofocus: focus search on open
          autoFocus
          className="w-full text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
      </div>

      {action && (
        <div
          className={`border-card-divider border-t-1 transition-colors hover:bg-gray-100 ${
            focusedIndex === ACTION_INDEX ? 'bg-gray-100' : ''
          }`}
        >
          <button
            type="button"
            className="h-full w-full cursor-pointer px-3 py-2 text-left text-sm text-text-primary"
            onClick={selectAction}
          >
            {action.render()}
          </button>
        </div>
      )}

      <div className="max-h-56 overflow-y-auto border-card-divider border-t-1" ref={listRef}>
        {filtered.map((option, index) => (
          <button
            type="button"
            key={getOptionKey(option)}
            onClick={() => selectOption(option)}
            className={`flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-gray-100 ${
              index === focusedIndex ? 'bg-gray-100' : ''
            }`}
          >
            {renderOption(option)}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-gray-500 text-sm">{emptyText}</div>
        )}
      </div>
    </div>
  )
}
