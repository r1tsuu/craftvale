import type { InventorySlot, InventorySnapshot, ItemId } from '../types.ts'

import {
  getCraftingResult,
  PLAYER_CRAFTING_GRID_HEIGHT,
  PLAYER_CRAFTING_GRID_WIDTH,
  PLAYER_CRAFTING_INPUT_SLOT_COUNT,
  takeCraftingResult,
} from './crafting.ts'
import {
  getItemMaxStackSize,
  isPlaceableItem,
  isValidItemId,
  ITEM_IDS,
  STARTER_INVENTORY_STACKS,
} from './items.ts'

export const HOTBAR_SLOT_COUNT = 9
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

export const normalizeInventorySlotArray = (
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
  for (let slot = 0; slot < HOTBAR_SLOT_COUNT; slot += 1) {
    if (isEmptySlot(inventory.slots[slot])) {
      return slot
    }
  }

  for (let slot = HOTBAR_SLOT_COUNT; slot < inventory.slots.length; slot += 1) {
    if (isEmptySlot(inventory.slots[slot])) {
      return slot
    }
  }

  return null
}

export const createEmptyInventorySlot = (): InventorySlot => ({ ...EMPTY_INVENTORY_SLOT })

export interface InventoryCursorInteractionResult {
  slots: InventorySlot[]
  cursor: InventorySlot | null
}

export const interactSlotArray = (
  slots: readonly InventorySlot[],
  cursor: InventorySlot | null,
  slot: number,
): InventoryCursorInteractionResult => {
  const normalizedSlots = normalizeInventorySlotArray(slots, Math.max(0, Math.trunc(slots.length)))
  const clampedSlot = Math.max(0, Math.min(normalizedSlots.length - 1, Math.trunc(slot)))
  const target = normalizedSlots[clampedSlot] ?? createEmptyInventorySlot()
  const normalizedCursor = isEmptySlot(cursor) ? null : normalizeSlot(cursor)

  if (normalizedSlots.length === 0) {
    return {
      slots: [],
      cursor: normalizedCursor,
    }
  }

  if (isEmptySlot(normalizedCursor) && isEmptySlot(target)) {
    return {
      slots: normalizedSlots,
      cursor: null,
    }
  }

  if (isEmptySlot(normalizedCursor)) {
    return {
      slots: normalizedSlots.map((entry, index) =>
        index === clampedSlot ? clearSlot() : cloneSlot(entry),
      ),
      cursor: cloneSlot(target),
    }
  }

  const held = normalizedCursor as InventorySlot

  if (isEmptySlot(target)) {
    return {
      slots: normalizedSlots.map((entry, index) =>
        index === clampedSlot ? cloneSlot(held) : cloneSlot(entry),
      ),
      cursor: null,
    }
  }

  const maxStackSize = getItemMaxStackSize(target.itemId)
  if (held.itemId === target.itemId && target.count < maxStackSize) {
    const transfer = Math.min(maxStackSize - target.count, held.count)
    return {
      slots: normalizedSlots.map((entry, index) =>
        index === clampedSlot
          ? {
              itemId: target.itemId,
              count: target.count + transfer,
            }
          : cloneSlot(entry),
      ),
      cursor:
        held.count - transfer > 0
          ? {
              itemId: held.itemId,
              count: held.count - transfer,
            }
          : null,
    }
  }

  return {
    slots: normalizedSlots.map((entry, index) =>
      index === clampedSlot ? cloneSlot(held) : cloneSlot(entry),
    ),
    cursor: cloneSlot(target),
  }
}

export const interactCraftingInputSlotArray = (
  slots: readonly InventorySlot[],
  cursor: InventorySlot | null,
  slot: number,
): InventoryCursorInteractionResult => {
  const normalizedSlots = normalizeInventorySlotArray(slots, Math.max(0, Math.trunc(slots.length)))
  if (normalizedSlots.length === 0) {
    return {
      slots: [],
      cursor: isEmptySlot(cursor) ? null : normalizeSlot(cursor),
    }
  }

  const clampedSlot = Math.max(0, Math.min(normalizedSlots.length - 1, Math.trunc(slot)))
  const target = normalizedSlots[clampedSlot] ?? createEmptyInventorySlot()
  const normalizedCursor = isEmptySlot(cursor) ? null : normalizeSlot(cursor)
  if (!normalizedCursor) {
    return interactSlotArray(normalizedSlots, null, clampedSlot)
  }

  if (isEmptySlot(target)) {
    return {
      slots: normalizedSlots.map((entry, index) =>
        index === clampedSlot
          ? {
              itemId: normalizedCursor.itemId,
              count: 1,
            }
          : cloneSlot(entry),
      ),
      cursor:
        normalizedCursor.count > 1
          ? {
              itemId: normalizedCursor.itemId,
              count: normalizedCursor.count - 1,
            }
          : null,
    }
  }

  const maxStackSize = getItemMaxStackSize(target.itemId)
  if (target.itemId === normalizedCursor.itemId && target.count < maxStackSize) {
    return {
      slots: normalizedSlots.map((entry, index) =>
        index === clampedSlot
          ? {
              itemId: target.itemId,
              count: target.count + 1,
            }
          : cloneSlot(entry),
      ),
      cursor:
        normalizedCursor.count > 1
          ? {
              itemId: normalizedCursor.itemId,
              count: normalizedCursor.count - 1,
            }
          : null,
    }
  }

  return interactSlotArray(normalizedSlots, normalizedCursor, clampedSlot)
}

export const createEmptyInventory = (): InventorySnapshot => ({
  slots: Array.from({ length: TOTAL_INVENTORY_SLOT_COUNT }, () => createEmptyInventorySlot()),
  playerCraftingInput: Array.from({ length: PLAYER_CRAFTING_INPUT_SLOT_COUNT }, () =>
    createEmptyInventorySlot(),
  ),
  selectedSlot: 0,
  cursor: null,
})

export const createStarterInventory = (): InventorySnapshot => {
  const slots = Array.from({ length: TOTAL_INVENTORY_SLOT_COUNT }, () => createEmptyInventorySlot())
  for (const stack of STARTER_INVENTORY_STACKS) {
    if (stack.slot < 0 || stack.slot >= slots.length) {
      continue
    }
    slots[stack.slot] = {
      itemId: stack.itemId ?? ITEM_IDS.empty,
      count: stack.count ?? 0,
    }
  }

  return {
    slots,
    playerCraftingInput: Array.from({ length: PLAYER_CRAFTING_INPUT_SLOT_COUNT }, () =>
      createEmptyInventorySlot(),
    ),
    selectedSlot: 0,
    cursor: null,
  }
}

export const normalizeInventorySnapshot = (
  snapshot: InventorySnapshot | null | undefined,
): InventorySnapshot => {
  const fallback = createEmptyInventory()
  if (!snapshot) {
    return fallback
  }

  return {
    slots: normalizeInventorySlotArray(snapshot.slots, TOTAL_INVENTORY_SLOT_COUNT),
    playerCraftingInput: normalizeInventorySlotArray(
      snapshot.playerCraftingInput,
      PLAYER_CRAFTING_INPUT_SLOT_COUNT,
    ),
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

export const getPlayerCraftingInputSlots = (inventory: InventorySnapshot): InventorySlot[] =>
  (inventory.playerCraftingInput ?? []).map((slot) => cloneSlot(slot))

export const getPlayerCraftingResult = (inventory: InventorySnapshot): InventorySlot | null =>
  getCraftingResult(
    inventory.playerCraftingInput ?? [],
    PLAYER_CRAFTING_GRID_WIDTH,
    PLAYER_CRAFTING_GRID_HEIGHT,
  )

export const interactInventorySlot = (
  inventory: InventorySnapshot,
  slot: number,
): InventorySnapshot => {
  const normalized = normalizeInventorySnapshot(inventory)
  const interaction = interactSlotArray(
    normalized.slots,
    normalized.cursor,
    clampInventorySlotIndex(slot),
  )
  return {
    ...normalized,
    slots: interaction.slots,
    cursor: interaction.cursor,
  }
}

export const interactPlayerCraftingInputSlot = (
  inventory: InventorySnapshot,
  slot: number,
): InventorySnapshot => {
  const normalized = normalizeInventorySnapshot(inventory)
  const interaction = interactCraftingInputSlotArray(
    normalized.playerCraftingInput ?? [],
    normalized.cursor,
    Math.max(0, Math.min(PLAYER_CRAFTING_INPUT_SLOT_COUNT - 1, Math.trunc(slot))),
  )
  return {
    ...normalized,
    playerCraftingInput: interaction.slots,
    cursor: interaction.cursor,
  }
}

export const takePlayerCraftingResult = (inventory: InventorySnapshot): InventorySnapshot => {
  const normalized = normalizeInventorySnapshot(inventory)
  const crafted = takeCraftingResult(
    normalized.playerCraftingInput ?? [],
    PLAYER_CRAFTING_GRID_WIDTH,
    PLAYER_CRAFTING_GRID_HEIGHT,
    normalized.cursor,
  )
  return {
    ...normalized,
    playerCraftingInput: crafted.inputSlots,
    cursor: crafted.cursor,
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

export const removeInventorySlotCount = (
  inventory: InventorySnapshot,
  slot: number,
  count: number,
): InventorySnapshot => {
  const normalized = normalizeInventorySnapshot(inventory)
  const clampedSlot = clampInventorySlotIndex(slot)
  const target = normalized.slots[clampedSlot] ?? createEmptyInventorySlot()
  if (isEmptySlot(target)) {
    return normalized
  }

  const nextCount = Math.max(0, target.count - Math.max(0, Math.trunc(count)))
  return withInventorySlot(
    normalized,
    clampedSlot,
    nextCount > 0 ? { itemId: target.itemId, count: nextCount } : clearSlot(),
  )
}

export const isInventoryItemSelectable = (itemId: ItemId): boolean => isPlaceableItem(itemId)
