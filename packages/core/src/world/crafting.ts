import type { InventorySlot, ItemId } from '../types.ts'

import { getItemMaxStackSize, ITEM_IDS } from './items.ts'

export interface CraftingRecipe {
  width: number
  height: number
  ingredients: readonly (ItemId | null)[]
  output: InventorySlot
}

export interface CraftingMatch {
  recipe: CraftingRecipe
  output: InventorySlot
  offsetX: number
  offsetY: number
}

export interface CraftingTakeResult {
  inputSlots: InventorySlot[]
  cursor: InventorySlot | null
  crafted: boolean
}

export const PLAYER_CRAFTING_GRID_WIDTH = 2
export const PLAYER_CRAFTING_GRID_HEIGHT = 2
export const PLAYER_CRAFTING_INPUT_SLOT_COUNT =
  PLAYER_CRAFTING_GRID_WIDTH * PLAYER_CRAFTING_GRID_HEIGHT
export const CRAFTING_TABLE_GRID_WIDTH = 3
export const CRAFTING_TABLE_GRID_HEIGHT = 3
export const CRAFTING_TABLE_INPUT_SLOT_COUNT =
  CRAFTING_TABLE_GRID_WIDTH * CRAFTING_TABLE_GRID_HEIGHT

const EMPTY_SLOT: InventorySlot = {
  itemId: ITEM_IDS.empty,
  count: 0,
}

const CRAFTING_RECIPES: readonly CraftingRecipe[] = [
  {
    width: 1,
    height: 1,
    ingredients: [ITEM_IDS.log],
    output: {
      itemId: ITEM_IDS.planks,
      count: 4,
    },
  },
  {
    width: 2,
    height: 2,
    ingredients: [ITEM_IDS.planks, ITEM_IDS.planks, ITEM_IDS.planks, ITEM_IDS.planks],
    output: {
      itemId: ITEM_IDS.craftingTable,
      count: 1,
    },
  },
]

const cloneSlot = (slot: InventorySlot): InventorySlot => ({
  itemId: slot.itemId,
  count: slot.count,
})

const clearSlot = (): InventorySlot => ({ ...EMPTY_SLOT })

const isEmptySlot = (slot: InventorySlot | null | undefined): boolean =>
  !slot || slot.itemId === ITEM_IDS.empty || slot.count <= 0

const normalizeSlot = (slot: InventorySlot | null | undefined): InventorySlot =>
  isEmptySlot(slot)
    ? clearSlot()
    : {
        itemId: slot!.itemId,
        count: Math.max(0, Math.trunc(slot!.count)),
      }

const getSlotIndex = (x: number, y: number, width: number): number => y * width + x

const normalizeInputSlots = (
  inputSlots: readonly InventorySlot[],
  width: number,
  height: number,
): InventorySlot[] =>
  Array.from({ length: width * height }, (_, index) => normalizeSlot(inputSlots[index]))

const getOccupiedBounds = (
  inputSlots: readonly InventorySlot[],
  width: number,
  height: number,
): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} | null => {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const slot = inputSlots[getSlotIndex(x, y, width)]
      if (isEmptySlot(slot)) {
        continue
      }

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) {
    return null
  }

  return { minX, minY, maxX, maxY }
}

export const getCraftingMatch = (
  inputSlots: readonly InventorySlot[],
  width: number,
  height: number,
): CraftingMatch | null => {
  const normalized = normalizeInputSlots(inputSlots, width, height)
  const bounds = getOccupiedBounds(normalized, width, height)
  if (!bounds) {
    return null
  }

  const occupiedWidth = bounds.maxX - bounds.minX + 1
  const occupiedHeight = bounds.maxY - bounds.minY + 1

  for (const recipe of CRAFTING_RECIPES) {
    if (recipe.width !== occupiedWidth || recipe.height !== occupiedHeight) {
      continue
    }

    let matched = true

    for (let y = 0; y < recipe.height && matched; y += 1) {
      for (let x = 0; x < recipe.width; x += 1) {
        const recipeItemId = recipe.ingredients[getSlotIndex(x, y, recipe.width)] ?? null
        const slot =
          normalized[getSlotIndex(bounds.minX + x, bounds.minY + y, width)] ?? clearSlot()
        if (recipeItemId === null) {
          if (!isEmptySlot(slot)) {
            matched = false
            break
          }
          continue
        }

        if (slot.itemId !== recipeItemId || slot.count <= 0) {
          matched = false
          break
        }
      }
    }

    if (!matched) {
      continue
    }

    return {
      recipe,
      output: cloneSlot(recipe.output),
      offsetX: bounds.minX,
      offsetY: bounds.minY,
    }
  }

  return null
}

export const getCraftingResult = (
  inputSlots: readonly InventorySlot[],
  width: number,
  height: number,
): InventorySlot | null => getCraftingMatch(inputSlots, width, height)?.output ?? null

export const takeCraftingResult = (
  inputSlots: readonly InventorySlot[],
  width: number,
  height: number,
  cursor: InventorySlot | null,
): CraftingTakeResult => {
  const match = getCraftingMatch(inputSlots, width, height)
  if (!match) {
    return {
      inputSlots: normalizeInputSlots(inputSlots, width, height),
      cursor: isEmptySlot(cursor) ? null : normalizeSlot(cursor),
      crafted: false,
    }
  }

  const normalizedCursor = isEmptySlot(cursor) ? null : normalizeSlot(cursor)
  const maxStackSize = getItemMaxStackSize(match.output.itemId)
  if (
    normalizedCursor &&
    (normalizedCursor.itemId !== match.output.itemId ||
      normalizedCursor.count + match.output.count > maxStackSize)
  ) {
    return {
      inputSlots: normalizeInputSlots(inputSlots, width, height),
      cursor: normalizedCursor,
      crafted: false,
    }
  }

  const nextInputSlots = normalizeInputSlots(inputSlots, width, height)
  for (let y = 0; y < match.recipe.height; y += 1) {
    for (let x = 0; x < match.recipe.width; x += 1) {
      const recipeItemId = match.recipe.ingredients[getSlotIndex(x, y, match.recipe.width)] ?? null
      if (recipeItemId === null) {
        continue
      }

      const slotIndex = getSlotIndex(match.offsetX + x, match.offsetY + y, width)
      const slot = nextInputSlots[slotIndex] ?? clearSlot()
      nextInputSlots[slotIndex] =
        slot.count > 1
          ? {
              itemId: slot.itemId,
              count: slot.count - 1,
            }
          : clearSlot()
    }
  }

  return {
    inputSlots: nextInputSlots,
    cursor: normalizedCursor
      ? {
          itemId: normalizedCursor.itemId,
          count: normalizedCursor.count + match.output.count,
        }
      : cloneSlot(match.output),
    crafted: true,
  }
}
