import { expect, test } from 'bun:test'

import type { InventorySlot } from '../packages/core/src/types.ts'

import {
  addInventoryItem,
  createEmptyInventory,
  createStarterInventory,
  DEFAULT_INVENTORY_STACK_SIZE,
  getHotbarInventorySlots,
  getMainInventorySlotIndex,
  getMainInventorySlots,
  interactInventorySlot,
  MAIN_INVENTORY_SLOT_COUNT,
  normalizeInventorySnapshot,
  setSelectedInventorySlot,
} from '../packages/core/src/world/inventory.ts'
import { ITEM_IDS } from '../packages/core/src/world/items.ts'

test('starter inventory creates a full hotbar plus a starter brick stack', () => {
  const inventory = createStarterInventory()
  const hotbar = getHotbarInventorySlots(inventory)
  const main = getMainInventorySlots(inventory)

  expect(hotbar).toHaveLength(9)
  expect(hotbar).toEqual([
    { itemId: ITEM_IDS.grass, count: DEFAULT_INVENTORY_STACK_SIZE },
    { itemId: ITEM_IDS.glowstone, count: DEFAULT_INVENTORY_STACK_SIZE },
    { itemId: ITEM_IDS.dirt, count: DEFAULT_INVENTORY_STACK_SIZE },
    { itemId: ITEM_IDS.stone, count: DEFAULT_INVENTORY_STACK_SIZE },
    { itemId: ITEM_IDS.log, count: DEFAULT_INVENTORY_STACK_SIZE },
    { itemId: ITEM_IDS.leaves, count: DEFAULT_INVENTORY_STACK_SIZE },
    { itemId: ITEM_IDS.empty, count: 0 },
    { itemId: ITEM_IDS.planks, count: DEFAULT_INVENTORY_STACK_SIZE },
    { itemId: ITEM_IDS.cobblestone, count: DEFAULT_INVENTORY_STACK_SIZE },
  ])
  expect(main).toHaveLength(MAIN_INVENTORY_SLOT_COUNT)
  expect(main[0]).toEqual({
    itemId: ITEM_IDS.glass,
    count: DEFAULT_INVENTORY_STACK_SIZE,
  })
  expect(main.slice(1).every((slot) => slot.itemId === ITEM_IDS.empty && slot.count === 0)).toBe(
    true,
  )
  expect(inventory.selectedSlot).toBe(0)
  expect(inventory.cursor).toBeNull()
})

test('empty inventory starts blank and safe for client-side placeholder state', () => {
  const inventory = createEmptyInventory()

  expect(inventory.slots).toHaveLength(9 + MAIN_INVENTORY_SLOT_COUNT)
  expect(inventory.slots.every((slot) => slot.itemId === ITEM_IDS.empty && slot.count === 0)).toBe(
    true,
  )
  expect(inventory.selectedSlot).toBe(0)
  expect(inventory.cursor).toBeNull()
})

test('inventory normalization clamps counts and fills missing slots safely', () => {
  const inventory = normalizeInventorySnapshot({
    slots: [
      { itemId: ITEM_IDS.grass, count: 3 },
      { itemId: ITEM_IDS.dirt, count: 4 },
      { itemId: ITEM_IDS.stone, count: 5 },
      { itemId: ITEM_IDS.log, count: 6 },
      { itemId: ITEM_IDS.leaves, count: 700 },
      ...Array.from({ length: 4 }, (): InventorySlot => ({ itemId: ITEM_IDS.empty, count: 0 })),
      { itemId: ITEM_IDS.brick, count: 2 },
    ],
    selectedSlot: 99,
    cursor: { itemId: ITEM_IDS.planks, count: 3 },
  })
  const hotbar = getHotbarInventorySlots(inventory)
  const main = getMainInventorySlots(inventory)

  expect(hotbar).toHaveLength(9)
  expect(main).toHaveLength(MAIN_INVENTORY_SLOT_COUNT)
  expect(hotbar.find((slot) => slot.itemId === ITEM_IDS.grass)?.count).toBe(3)
  expect(hotbar.find((slot) => slot.itemId === ITEM_IDS.leaves)?.count).toBe(
    DEFAULT_INVENTORY_STACK_SIZE,
  )
  expect(hotbar[5]).toEqual({ itemId: ITEM_IDS.empty, count: 0 })
  expect(hotbar[8]).toEqual({ itemId: ITEM_IDS.empty, count: 0 })
  expect(main[0]).toEqual({ itemId: ITEM_IDS.brick, count: 2 })
  expect(inventory.selectedSlot).toBe(8)
  expect(inventory.cursor).toEqual({ itemId: ITEM_IDS.planks, count: 3 })
})

test('selected slot clamps across the nine-slot hotbar range', () => {
  const inventory = createStarterInventory()

  expect(setSelectedInventorySlot(inventory, -5).selectedSlot).toBe(0)
  expect(setSelectedInventorySlot(inventory, 8).selectedSlot).toBe(8)
  expect(setSelectedInventorySlot(inventory, 200).selectedSlot).toBe(8)
})

test('adding items fills empty main-inventory stacks when hotbar stacks are full', () => {
  const inventory = createStarterInventory()
  const result = addInventoryItem(inventory, ITEM_IDS.grass, 5)
  const main = getMainInventorySlots(result.inventory)

  expect(result.added).toBe(5)
  expect(result.remaining).toBe(0)
  expect(main[0]).toEqual({ itemId: ITEM_IDS.glass, count: 64 })
  expect(main[1]).toEqual({ itemId: ITEM_IDS.grass, count: 5 })
})

test('inventory interaction picks up, places, and merges stacks', () => {
  let inventory = createStarterInventory()
  inventory = interactInventorySlot(inventory, 0)

  expect(inventory.cursor).toEqual({ itemId: ITEM_IDS.grass, count: 64 })
  expect(getHotbarInventorySlots(inventory)[0]).toEqual({ itemId: ITEM_IDS.empty, count: 0 })

  inventory = interactInventorySlot(inventory, getMainInventorySlotIndex(1))
  expect(inventory.cursor).toBeNull()
  expect(getMainInventorySlots(inventory)[1]).toEqual({ itemId: ITEM_IDS.grass, count: 64 })

  inventory = normalizeInventorySnapshot({
    slots: [
      { itemId: ITEM_IDS.grass, count: 24 },
      ...getHotbarInventorySlots(createStarterInventory()).slice(1),
      { itemId: ITEM_IDS.grass, count: 12 },
      ...Array.from(
        { length: MAIN_INVENTORY_SLOT_COUNT - 1 },
        (): InventorySlot => ({ itemId: ITEM_IDS.empty, count: 0 }),
      ),
    ],
    selectedSlot: 0,
    cursor: null,
  })

  inventory = interactInventorySlot(inventory, getMainInventorySlotIndex(0))
  expect(inventory.cursor).toEqual({ itemId: ITEM_IDS.grass, count: 12 })
  inventory = interactInventorySlot(inventory, 0)
  expect(getHotbarInventorySlots(inventory)[0]).toEqual({ itemId: ITEM_IDS.grass, count: 36 })
  expect(inventory.cursor).toBeNull()
})
