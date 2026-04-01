'use client'

import { ProductMappingTable } from '@settings/components/ProductMapping/ProductMappingTable'
import { useSettingsContext } from '@settings/hooks/useSettings'
import { Checkbox } from 'copilot-design-system'

export const ProductMapping = () => {
  const { syncProductsAutomatically, updateSettings, productMappings } = useSettingsContext()

  return (
    <div className="mb-5">
      <Checkbox
        label="Sync Assembly services to Xero"
        description="Automatically create and update Xero items when services are created or updated in Assembly."
        checked={syncProductsAutomatically}
        onChange={() => updateSettings({ syncProductsAutomatically: !syncProductsAutomatically })}
      />
      <ProductMappingTable items={productMappings} />
    </div>
  )
}
