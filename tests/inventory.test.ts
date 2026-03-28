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
  removeInventorySlotCount,
  setSelectedInventorySlot,
} from '../packages/core/src/world/inventory.ts'
import { ITEM_IDS } from '../packages/core/src/world/items.ts'

test('starter inventory creates expected hotbar items with remaining slots empty', () => {
  const inventory = createStarterInventory()
  const hotbar = getHotbarInventorySlots(inventory)
  const main = getMainInventorySlots(inventory)

  expect(hotbar).toHaveLength(9)
  expect(hotbar[0]).toEqual({ itemId: ITEM_IDS.grass, count: DEFAULT_INVENTORY_STACK_SIZE })
  expect(hotbar[1]).toEqual({ itemId: ITEM_IDS.glowstone, count: DEFAULT_INVENTORY_STACK_SIZE })
  expect(hotbar[2]).toEqual({ itemId: ITEM_IDS.dirt, count: DEFAULT_INVENTORY_STACK_SIZE })
  expect(hotbar[3]).toEqual({ itemId: ITEM_IDS.glass, count: DEFAULT_INVENTORY_STACK_SIZE })
  expect(hotbar.slice(4).every((slot) => slot.itemId === ITEM_IDS.empty && slot.count === 0)).toBe(
    true,
  )
  expect(main).toHaveLength(MAIN_INVENTORY_SLOT_COUNT)
  expect(main.every((slot) => slot.itemId === ITEM_IDS.empty && slot.count === 0)).toBe(true)
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

test('adding items prefers empty hotbar slots over main inventory', () => {
  // Starter inventory has slots 4-8 empty in the hotbar; new items should land in slot 4, not main
  const inventory = createStarterInventory()
  const result = addInventoryItem(inventory, ITEM_IDS.sand, 5)
  const hotbar = getHotbarInventorySlots(result.inventory)
  const main = getMainInventorySlots(result.inventory)

  expect(result.added).toBe(5)
  expect(result.remaining).toBe(0)
  expect(hotbar[4]).toEqual({ itemId: ITEM_IDS.sand, count: 5 })
  expect(main.every((slot) => slot.itemId === ITEM_IDS.empty)).toBe(true)
})

test('adding items spills into main inventory only after hotbar is full', () => {
  // Fill every hotbar slot, then add items — they must go to main inventory
  const inventory = normalizeInventorySnapshot({
    slots: [
      { itemId: ITEM_IDS.grass, count: 64 },
      { itemId: ITEM_IDS.dirt, count: 64 },
      { itemId: ITEM_IDS.stone, count: 64 },
      { itemId: ITEM_IDS.log, count: 64 },
      { itemId: ITEM_IDS.leaves, count: 64 },
      { itemId: ITEM_IDS.glowstone, count: 64 },
      { itemId: ITEM_IDS.planks, count: 64 },
      { itemId: ITEM_IDS.glass, count: 64 },
      { itemId: ITEM_IDS.brick, count: 64 },
      ...Array.from(
        { length: MAIN_INVENTORY_SLOT_COUNT },
        (): InventorySlot => ({ itemId: ITEM_IDS.empty, count: 0 }),
      ),
    ],
    selectedSlot: 0,
    cursor: null,
  })
  const result = addInventoryItem(inventory, ITEM_IDS.sand, 5)
  const main = getMainInventorySlots(result.inventory)

  expect(result.added).toBe(5)
  expect(result.remaining).toBe(0)
  expect(main[0]).toEqual({ itemId: ITEM_IDS.sand, count: 5 })
})

test('adding items fills partial hotbar stacks before claiming empty main-inventory slots', () => {
  // Partial grass stack in hotbar slot 0; new grass should fill it, not open a new main slot
  const inventory = normalizeInventorySnapshot({
    slots: [
      { itemId: ITEM_IDS.grass, count: 60 },
      ...Array.from(
        { length: 8 + MAIN_INVENTORY_SLOT_COUNT },
        (): InventorySlot => ({ itemId: ITEM_IDS.empty, count: 0 }),
      ),
    ],
    selectedSlot: 0,
    cursor: null,
  })
  const result = addInventoryItem(inventory, ITEM_IDS.grass, 4)
  const hotbar = getHotbarInventorySlots(result.inventory)
  const main = getMainInventorySlots(result.inventory)

  expect(result.added).toBe(4)
  expect(result.remaining).toBe(0)
  expect(hotbar[0]).toEqual({ itemId: ITEM_IDS.grass, count: 64 })
  expect(main.every((slot) => slot.itemId === ITEM_IDS.empty)).toBe(true)
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

test('removeInventorySlotCount decrements slot by the requested amount', () => {
  const inventory = createStarterInventory() // slot 0 = grass × 64
  const result = removeInventorySlotCount(inventory, 0, 10)

  expect(getHotbarInventorySlots(result)[0]).toEqual({ itemId: ITEM_IDS.grass, count: 54 })
})

test('removeInventorySlotCount zeroes slot when count equals stack size', () => {
  const inventory = createStarterInventory()
  const result = removeInventorySlotCount(inventory, 0, 64)

  expect(getHotbarInventorySlots(result)[0]).toEqual({ itemId: ITEM_IDS.empty, count: 0 })
})

test('removeInventorySlotCount zeroes slot when count exceeds available items', () => {
  const inventory = createStarterInventory()
  const result = removeInventorySlotCount(inventory, 0, 100)

  expect(getHotbarInventorySlots(result)[0]).toEqual({ itemId: ITEM_IDS.empty, count: 0 })
})

test('removeInventorySlotCount leaves other slots unchanged', () => {
  const inventory = createStarterInventory()
  const result = removeInventorySlotCount(inventory, 0, 5)
  const hotbar = getHotbarInventorySlots(result)

  for (let i = 1; i < 9; i++) {
    expect(hotbar[i]).toEqual(getHotbarInventorySlots(inventory)[i])
  }
})
