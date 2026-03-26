import type { InventorySlot, InventorySnapshot, ItemId } from '../types.ts'

import {
  getItemMaxStackSize,
  HOTBAR_ITEM_IDS,
  isPlaceableItem,
  isValidItemId,
  ITEM_IDS,
  STARTER_MAIN_INVENTORY_STACKS,
} from './items.ts'

export const HOTBAR_SLOT_COUNT = HOTBAR_ITEM_IDS.length
export const MAIN_INVENTORY_SLOT_COUNT = 27
export const TOTAL_INVENTORY_SLOT_COUNT = HOTBAR_SLOT_COUNT + MAIN_INVENTORY_SLOT_COUNT
export const DEFAULT_INVENTORY_STACK_SIZE = 64

const EMPTY_INVENTORY_SLOT: InventorySlot = {
  itemId: ITEM_IDS.empty,
  count: 0,
}

const clampCount = (count: number, max = DEFAULT_INVENTORY_STACK_SIZE): number =>
  Math.max(0, Math.min(max, Math.trunc(count)))

const clampHotbarSlotIndex = (slot: number): number =>
  Math.max(0, Math.min(HOTBAR_SLOT_COUNT - 1, Math.trunc(slot)))

const clampInventorySlotIndex = (slot: number): number =>
  Math.max(0, Math.min(TOTAL_INVENTORY_SLOT_COUNT - 1, Math.trunc(slot)))

const normalizeSlot = (slot: InventorySlot | null | undefined): InventorySlot => {
  if (!slot || !isValidItemId(slot.itemId)) {
    return { ...EMPTY_INVENTORY_SLOT }
  }

  const count = clampCount(slot.count, getItemMaxStackSize(slot.itemId))
  if (slot.itemId === ITEM_IDS.empty || count === 0) {
    return { ...EMPTY_INVENTORY_SLOT }
  }

  return {
    itemId: slot.itemId,
    count,
  }
}

const cloneSlot = (slot: InventorySlot): InventorySlot => ({
  itemId: slot.itemId,
  count: slot.count,
})

const normalizeSlots = (
  slots: readonly InventorySlot[] | null | undefined,
  length: number,
): InventorySlot[] => Array.from({ length }, (_, index) => normalizeSlot(slots?.[index]))

const withInventorySlot = (
  inventory: InventorySnapshot,
  slot: number,
  value: InventorySlot,
): InventorySnapshot => {
  const clampedSlot = clampInventorySlotIndex(slot)
  const next = inventory.slots.map((entry, index) =>
    index === clampedSlot ? cloneSlot(value) : cloneSlot(entry),
  )
  return {
    ...inventory,
    slots: next,
  }
}

const isEmptySlot = (slot: InventorySlot | null | undefined): boolean =>
  !slot || slot.itemId === ITEM_IDS.empty || slot.count <= 0

const clearSlot = (): InventorySlot => ({ ...EMPTY_INVENTORY_SLOT })

export const getHotbarSlotIndex = (slot: number): number => clampHotbarSlotIndex(slot)

export const getMainInventorySlotIndex = (slot: number): number =>
  HOTBAR_SLOT_COUNT + Math.max(0, Math.min(MAIN_INVENTORY_SLOT_COUNT - 1, Math.trunc(slot)))

export const getHotbarInventorySlots = (inventory: InventorySnapshot): InventorySlot[] =>
  inventory.slots.slice(0, HOTBAR_SLOT_COUNT)

export const getMainInventorySlots = (inventory: InventorySnapshot): InventorySlot[] =>
  inventory.slots.slice(HOTBAR_SLOT_COUNT, TOTAL_INVENTORY_SLOT_COUNT)

const findPartialStackSlot = (inventory: InventorySnapshot, itemId: ItemId): number | null => {
  for (let slot = 0; slot < inventory.slots.length; slot += 1) {
    const entry = inventory.slots[slot]!
    const maxStackSize = getItemMaxStackSize(entry.itemId)
    if (entry.itemId === itemId && entry.count > 0 && entry.count < maxStackSize) {
      return slot
    }
  }

  return null
}

const findEmptySlot = (inventory: InventorySnapshot): number | null => {
  for (let slot = HOTBAR_SLOT_COUNT; slot < inventory.slots.length; slot += 1) {
    if (isEmptySlot(inventory.slots[slot])) {
      return slot
    }
  }

  for (let slot = 0; slot < HOTBAR_SLOT_COUNT; slot += 1) {
    if (isEmptySlot(inventory.slots[slot])) {
      return slot
    }
  }

  return null
}

export const createEmptyInventorySlot = (): InventorySlot => ({ ...EMPTY_INVENTORY_SLOT })

export const createDefaultInventory = (): InventorySnapshot => {
  const starterMainStacks = new Map<number, (typeof STARTER_MAIN_INVENTORY_STACKS)[number]>(
    STARTER_MAIN_INVENTORY_STACKS.map((stack) => [stack.slot, stack] as const),
  )
  const slots = Array.from({ length: TOTAL_INVENTORY_SLOT_COUNT }, (_, index): InventorySlot => {
    if (index < HOTBAR_SLOT_COUNT) {
      return {
        itemId: HOTBAR_ITEM_IDS[index] ?? ITEM_IDS.empty,
        count: DEFAULT_INVENTORY_STACK_SIZE,
      }
    }

    const starterStack = starterMainStacks.get(index - HOTBAR_SLOT_COUNT)
    return starterStack
      ? {
          itemId: starterStack.itemId ?? ITEM_IDS.empty,
          count: starterStack.count ?? 0,
        }
      : createEmptyInventorySlot()
  })

  return {
    slots,
    selectedSlot: 0,
    cursor: null,
  }
}

export const normalizeInventorySnapshot = (
  snapshot: InventorySnapshot | null | undefined,
): InventorySnapshot => {
  const fallback = createDefaultInventory()
  if (!snapshot) {
    return fallback
  }

  return {
    slots: normalizeSlots(snapshot.slots, TOTAL_INVENTORY_SLOT_COUNT),
    selectedSlot: clampHotbarSlotIndex(snapshot.selectedSlot),
    cursor: isEmptySlot(snapshot.cursor) ? null : normalizeSlot(snapshot.cursor),
  }
}

export const getSelectedInventorySlot = (inventory: InventorySnapshot): InventorySlot =>
  inventory.slots[clampHotbarSlotIndex(inventory.selectedSlot)] ?? createEmptyInventorySlot()

export const getSelectedInventoryItemId = (inventory: InventorySnapshot): ItemId =>
  getSelectedInventorySlot(inventory).itemId

export const getInventoryCount = (inventory: InventorySnapshot, itemId: ItemId): number =>
  inventory.slots.reduce((total, slot) => total + (slot.itemId === itemId ? slot.count : 0), 0)

export const setSelectedInventorySlot = (
  inventory: InventorySnapshot,
  slot: number,
): InventorySnapshot => ({
  ...inventory,
  selectedSlot: clampHotbarSlotIndex(slot),
})

export const getInventorySlot = (inventory: InventorySnapshot, slot: number): InventorySlot =>
  inventory.slots[clampInventorySlotIndex(slot)] ?? createEmptyInventorySlot()

export const interactInventorySlot = (
  inventory: InventorySnapshot,
  slot: number,
): InventorySnapshot => {
  const normalized = normalizeInventorySnapshot(inventory)
  const clampedSlot = clampInventorySlotIndex(slot)
  const target = getInventorySlot(normalized, clampedSlot)
  const cursor = normalized.cursor ?? null

  if (isEmptySlot(cursor) && isEmptySlot(target)) {
    return normalized
  }

  if (isEmptySlot(cursor)) {
    return {
      ...withInventorySlot(normalized, clampedSlot, clearSlot()),
      cursor: cloneSlot(target),
    }
  }

  const held = cursor as InventorySlot

  if (isEmptySlot(target)) {
    return {
      ...withInventorySlot(normalized, clampedSlot, held),
      cursor: null,
    }
  }

  const maxStackSize = getItemMaxStackSize(target.itemId)
  if (held.itemId === target.itemId && target.count < maxStackSize) {
    const transfer = Math.min(maxStackSize - target.count, held.count)
    const nextTarget: InventorySlot = {
      itemId: target.itemId,
      count: target.count + transfer,
    }
    const remaining = held.count - transfer
    return {
      ...withInventorySlot(normalized, clampedSlot, nextTarget),
      cursor:
        remaining > 0
          ? {
              itemId: held.itemId,
              count: remaining,
            }
          : null,
    }
  }

  return {
    ...withInventorySlot(normalized, clampedSlot, held),
    cursor: cloneSlot(target),
  }
}

export const addInventoryItem = (
  inventory: InventorySnapshot,
  itemId: ItemId,
  count: number,
): { inventory: InventorySnapshot; added: number; remaining: number } => {
  let next = normalizeInventorySnapshot(inventory)
  let remaining = Math.max(0, Math.trunc(count))

  while (remaining > 0) {
    const partial = findPartialStackSlot(next, itemId)
    if (partial === null) {
      break
    }

    const target = getInventorySlot(next, partial)
    const transfer = Math.min(getItemMaxStackSize(target.itemId) - target.count, remaining)
    next = withInventorySlot(next, partial, {
      itemId,
      count: target.count + transfer,
    })
    remaining -= transfer
  }

  while (remaining > 0) {
    const empty = findEmptySlot(next)
    if (empty === null) {
      break
    }

    const transfer = Math.min(getItemMaxStackSize(itemId), remaining)
    next = withInventorySlot(next, empty, {
      itemId,
      count: transfer,
    })
    remaining -= transfer
  }

  return {
    inventory: next,
    added: Math.max(0, Math.trunc(count)) - remaining,
    remaining,
  }
}

export const removeFromSelectedInventorySlot = (
  inventory: InventorySnapshot,
  count: number,
): InventorySnapshot => {
  const normalized = normalizeInventorySnapshot(inventory)
  const selectedSlot = clampHotbarSlotIndex(normalized.selectedSlot)
  const target = normalized.slots[selectedSlot] ?? createEmptyInventorySlot()
  if (isEmptySlot(target)) {
    return normalized
  }

  const nextCount = Math.max(0, target.count - Math.max(0, Math.trunc(count)))
  return withInventorySlot(
    normalized,
    selectedSlot,
    nextCount > 0
      ? {
          itemId: target.itemId,
          count: nextCount,
        }
      : clearSlot(),
  )
}

export const isInventoryItemSelectable = (itemId: ItemId): boolean => isPlaceableItem(itemId)
