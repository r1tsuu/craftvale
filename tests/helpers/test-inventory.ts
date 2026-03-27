import type { InventorySnapshot } from '../../packages/core/src/types.ts'

import {
  createEmptyInventory,
  DEFAULT_INVENTORY_STACK_SIZE,
  HOTBAR_SLOT_COUNT,
} from '../../packages/core/src/world/inventory.ts'
import { ITEM_IDS } from '../../packages/core/src/world/items.ts'

/**
 * A stable, test-only starter inventory that does not change with the
 * production default. Integration tests reference specific slots and items
 * from this layout so that changes to DEFAULT_STARTER_INVENTORY_STACK_SPECS
 * do not break them.
 *
 * Layout:
 *   Hotbar [0-8]: grass, glowstone, dirt, stone, log, leaves, <empty>, planks, cobblestone
 *   Main   [0]  : glass (slot index 9)
 */
export const createTestStarterInventory = (): InventorySnapshot => {
  const inventory = createEmptyInventory()
  const slots = [...inventory.slots]

  const hotbar: Array<keyof typeof ITEM_IDS> = [
    'grass',
    'glowstone',
    'dirt',
    'stone',
    'log',
    'leaves',
    'empty', // slot 6 intentionally empty
    'planks',
    'cobblestone',
  ]

  for (let i = 0; i < hotbar.length; i++) {
    const key = hotbar[i]!
    if (key === 'empty') continue
    slots[i] = { itemId: ITEM_IDS[key], count: DEFAULT_INVENTORY_STACK_SIZE }
  }

  // main[0] = glass
  slots[HOTBAR_SLOT_COUNT] = { itemId: ITEM_IDS.glass, count: DEFAULT_INVENTORY_STACK_SIZE }

  return { ...inventory, slots }
}
