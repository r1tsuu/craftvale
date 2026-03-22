import type { BlockId, InventorySnapshot, InventorySlot } from "../types.ts";
import { Blocks } from "./blocks.ts";

export const HOTBAR_BLOCK_IDS = [1, 2, 3, 4, 5] as const satisfies readonly BlockId[];
export const DEFAULT_INVENTORY_STACK_SIZE = 64;

const clampSlotIndex = (slot: number): number =>
  Math.max(0, Math.min(HOTBAR_BLOCK_IDS.length - 1, Math.trunc(slot)));

export const createDefaultInventory = (): InventorySnapshot => ({
  slots: HOTBAR_BLOCK_IDS.map((blockId): InventorySlot => ({
    blockId,
    count: DEFAULT_INVENTORY_STACK_SIZE,
  })),
  selectedSlot: 0,
});

export const normalizeInventorySnapshot = (
  snapshot: InventorySnapshot | null | undefined,
): InventorySnapshot => {
  const fallback = createDefaultInventory();
  if (!snapshot) {
    return fallback;
  }

  const countsByBlock = new Map<BlockId, number>();
  for (const slot of snapshot.slots) {
    if (!HOTBAR_BLOCK_IDS.includes(slot.blockId)) {
      continue;
    }

    countsByBlock.set(slot.blockId, Math.max(0, Math.trunc(slot.count)));
  }

  return {
    slots: HOTBAR_BLOCK_IDS.map((blockId) => ({
      blockId,
      count: countsByBlock.get(blockId) ?? 0,
    })),
    selectedSlot: clampSlotIndex(snapshot.selectedSlot),
  };
};

export const getSelectedInventorySlot = (
  inventory: InventorySnapshot,
): InventorySlot => inventory.slots[clampSlotIndex(inventory.selectedSlot)] ?? inventory.slots[0]!;

export const getSelectedInventoryBlockId = (
  inventory: InventorySnapshot,
): BlockId => getSelectedInventorySlot(inventory).blockId;

export const getInventoryCount = (
  inventory: InventorySnapshot,
  blockId: BlockId,
): number => inventory.slots.find((slot) => slot.blockId === blockId)?.count ?? 0;

export const setInventoryCount = (
  inventory: InventorySnapshot,
  blockId: BlockId,
  count: number,
): InventorySnapshot => ({
  ...inventory,
  slots: inventory.slots.map((slot) =>
    slot.blockId === blockId
      ? {
          ...slot,
          count: Math.max(0, Math.trunc(count)),
        }
      : slot,
  ),
});

export const adjustInventoryCount = (
  inventory: InventorySnapshot,
  blockId: BlockId,
  delta: number,
): InventorySnapshot => setInventoryCount(inventory, blockId, getInventoryCount(inventory, blockId) + delta);

export const setSelectedInventorySlot = (
  inventory: InventorySnapshot,
  slot: number,
): InventorySnapshot => ({
  ...inventory,
  selectedSlot: clampSlotIndex(slot),
});

export const isInventoryBlockSelectable = (blockId: BlockId): boolean => {
  const block = Blocks[blockId];
  return Boolean(block?.placeable && block.collectible);
};
