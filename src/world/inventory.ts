import type { BlockId, InventorySection, InventorySnapshot, InventorySlot } from "../types.ts";
import { Blocks } from "./blocks.ts";

export const HOTBAR_BLOCK_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const satisfies readonly BlockId[];
export const HOTBAR_SLOT_COUNT = HOTBAR_BLOCK_IDS.length;
export const MAIN_INVENTORY_SLOT_COUNT = 27;
export const DEFAULT_INVENTORY_STACK_SIZE = 64;

const EMPTY_INVENTORY_SLOT: InventorySlot = {
  blockId: 0,
  count: 0,
};

const clampCount = (count: number): number =>
  Math.max(0, Math.min(DEFAULT_INVENTORY_STACK_SIZE, Math.trunc(count)));

const clampHotbarSlotIndex = (slot: number): number =>
  Math.max(0, Math.min(HOTBAR_SLOT_COUNT - 1, Math.trunc(slot)));

const clampInventorySlotIndex = (slot: number, section: InventorySection): number =>
  Math.max(
    0,
    Math.min((section === "hotbar" ? HOTBAR_SLOT_COUNT : MAIN_INVENTORY_SLOT_COUNT) - 1, Math.trunc(slot)),
  );

const isValidInventoryBlockId = (blockId: number): blockId is BlockId =>
  Number.isInteger(blockId) && blockId >= 0 && blockId <= 9;

const normalizeSlot = (slot: InventorySlot | null | undefined): InventorySlot => {
  if (!slot || !isValidInventoryBlockId(slot.blockId)) {
    return { ...EMPTY_INVENTORY_SLOT };
  }

  const count = clampCount(slot.count);
  if (slot.blockId === 0 || count === 0) {
    return { ...EMPTY_INVENTORY_SLOT };
  }

  return {
    blockId: slot.blockId,
    count,
  };
};

const cloneSlot = (slot: InventorySlot): InventorySlot => ({
  blockId: slot.blockId,
  count: slot.count,
});

const normalizeSection = (
  slots: readonly InventorySlot[] | null | undefined,
  length: number,
): InventorySlot[] =>
  Array.from({ length }, (_, index) => normalizeSlot(slots?.[index]));

const getSection = (
  inventory: InventorySnapshot,
  section: InventorySection,
): InventorySlot[] => section === "hotbar" ? inventory.hotbar : inventory.main;

const withSectionSlot = (
  inventory: InventorySnapshot,
  section: InventorySection,
  slot: number,
  value: InventorySlot,
): InventorySnapshot => {
  const next = getSection(inventory, section).map((entry, index) =>
    index === slot ? cloneSlot(value) : cloneSlot(entry)
  );
  return section === "hotbar"
    ? {
        ...inventory,
        hotbar: next,
      }
    : {
        ...inventory,
        main: next,
      };
};

const isEmptySlot = (slot: InventorySlot | null | undefined): boolean =>
  !slot || slot.blockId === 0 || slot.count <= 0;

const clearSlot = (): InventorySlot => ({ ...EMPTY_INVENTORY_SLOT });

const findPartialStackSlot = (
  inventory: InventorySnapshot,
  blockId: BlockId,
): { section: InventorySection; slot: number } | null => {
  for (const section of ["hotbar", "main"] as const) {
    const slots = getSection(inventory, section);
    for (let slot = 0; slot < slots.length; slot += 1) {
      const entry = slots[slot]!;
      if (entry.blockId === blockId && entry.count > 0 && entry.count < DEFAULT_INVENTORY_STACK_SIZE) {
        return { section, slot };
      }
    }
  }

  return null;
};

const findEmptySlot = (inventory: InventorySnapshot): { section: InventorySection; slot: number } | null => {
  for (const section of ["main", "hotbar"] as const) {
    const slots = getSection(inventory, section);
    for (let slot = 0; slot < slots.length; slot += 1) {
      if (isEmptySlot(slots[slot])) {
        return { section, slot };
      }
    }
  }

  return null;
};

export const createEmptyInventorySlot = (): InventorySlot => ({ ...EMPTY_INVENTORY_SLOT });

export const createDefaultInventory = (): InventorySnapshot => ({
  hotbar: HOTBAR_BLOCK_IDS.map((blockId): InventorySlot => ({
    blockId,
    count: DEFAULT_INVENTORY_STACK_SIZE,
  })),
  main: Array.from({ length: MAIN_INVENTORY_SLOT_COUNT }, () => createEmptyInventorySlot()),
  selectedSlot: 0,
  cursor: null,
});

export const normalizeInventorySnapshot = (
  snapshot: InventorySnapshot | null | undefined,
): InventorySnapshot => {
  const fallback = createDefaultInventory();
  if (!snapshot) {
    return fallback;
  }

  return {
    hotbar: normalizeSection(snapshot.hotbar, HOTBAR_SLOT_COUNT),
    main: normalizeSection(snapshot.main, MAIN_INVENTORY_SLOT_COUNT),
    selectedSlot: clampHotbarSlotIndex(snapshot.selectedSlot),
    cursor: isEmptySlot(snapshot.cursor) ? null : normalizeSlot(snapshot.cursor),
  };
};

export const getSelectedInventorySlot = (
  inventory: InventorySnapshot,
): InventorySlot => inventory.hotbar[clampHotbarSlotIndex(inventory.selectedSlot)] ?? createEmptyInventorySlot();

export const getSelectedInventoryBlockId = (
  inventory: InventorySnapshot,
): BlockId => getSelectedInventorySlot(inventory).blockId;

export const getInventoryCount = (
  inventory: InventorySnapshot,
  blockId: BlockId,
): number =>
  [...inventory.hotbar, ...inventory.main].reduce(
    (total, slot) => total + (slot.blockId === blockId ? slot.count : 0),
    0,
  );

export const setSelectedInventorySlot = (
  inventory: InventorySnapshot,
  slot: number,
): InventorySnapshot => ({
  ...inventory,
  selectedSlot: clampHotbarSlotIndex(slot),
});

export const getInventorySlot = (
  inventory: InventorySnapshot,
  section: InventorySection,
  slot: number,
): InventorySlot => getSection(inventory, section)[clampInventorySlotIndex(slot, section)] ?? createEmptyInventorySlot();

export const interactInventorySlot = (
  inventory: InventorySnapshot,
  section: InventorySection,
  slot: number,
): InventorySnapshot => {
  const normalized = normalizeInventorySnapshot(inventory);
  const clampedSlot = clampInventorySlotIndex(slot, section);
  const target = getInventorySlot(normalized, section, clampedSlot);
  const cursor = normalized.cursor ?? null;

  if (isEmptySlot(cursor) && isEmptySlot(target)) {
    return normalized;
  }

  if (isEmptySlot(cursor)) {
    return {
      ...withSectionSlot(normalized, section, clampedSlot, clearSlot()),
      cursor: cloneSlot(target),
    };
  }

  const held = cursor as InventorySlot;

  if (isEmptySlot(target)) {
    return {
      ...withSectionSlot(normalized, section, clampedSlot, held),
      cursor: null,
    };
  }

  if (held.blockId === target.blockId && target.count < DEFAULT_INVENTORY_STACK_SIZE) {
    const transfer = Math.min(DEFAULT_INVENTORY_STACK_SIZE - target.count, held.count);
    const nextTarget: InventorySlot = {
      blockId: target.blockId,
      count: target.count + transfer,
    };
    const remaining = held.count - transfer;
    return {
      ...withSectionSlot(normalized, section, clampedSlot, nextTarget),
      cursor: remaining > 0
        ? {
            blockId: held.blockId,
            count: remaining,
          }
        : null,
    };
  }

  return {
    ...withSectionSlot(normalized, section, clampedSlot, held),
    cursor: cloneSlot(target),
  };
};

export const addInventoryItem = (
  inventory: InventorySnapshot,
  blockId: BlockId,
  count: number,
): { inventory: InventorySnapshot; added: number; remaining: number } => {
  let next = normalizeInventorySnapshot(inventory);
  let remaining = Math.max(0, Math.trunc(count));

  while (remaining > 0) {
    const partial = findPartialStackSlot(next, blockId);
    if (!partial) {
      break;
    }

    const target = getInventorySlot(next, partial.section, partial.slot);
    const transfer = Math.min(DEFAULT_INVENTORY_STACK_SIZE - target.count, remaining);
    next = withSectionSlot(next, partial.section, partial.slot, {
      blockId,
      count: target.count + transfer,
    });
    remaining -= transfer;
  }

  while (remaining > 0) {
    const empty = findEmptySlot(next);
    if (!empty) {
      break;
    }

    const transfer = Math.min(DEFAULT_INVENTORY_STACK_SIZE, remaining);
    next = withSectionSlot(next, empty.section, empty.slot, {
      blockId,
      count: transfer,
    });
    remaining -= transfer;
  }

  return {
    inventory: next,
    added: Math.max(0, Math.trunc(count)) - remaining,
    remaining,
  };
};

export const removeFromSelectedInventorySlot = (
  inventory: InventorySnapshot,
  count: number,
): InventorySnapshot => {
  const normalized = normalizeInventorySnapshot(inventory);
  const selectedSlot = clampHotbarSlotIndex(normalized.selectedSlot);
  const target = normalized.hotbar[selectedSlot] ?? createEmptyInventorySlot();
  if (isEmptySlot(target)) {
    return normalized;
  }

  const nextCount = Math.max(0, target.count - Math.max(0, Math.trunc(count)));
  return withSectionSlot(
    normalized,
    "hotbar",
    selectedSlot,
    nextCount > 0
      ? {
          blockId: target.blockId,
          count: nextCount,
        }
      : clearSlot(),
  );
};

export const isInventoryBlockSelectable = (blockId: BlockId): boolean => {
  const block = Blocks[blockId];
  return Boolean(block?.placeable && block.collectible);
};
