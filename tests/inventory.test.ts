import { expect, test } from "bun:test";
import type { InventorySlot } from "../src/types.ts";
import {
  DEFAULT_INVENTORY_STACK_SIZE,
  HOTBAR_BLOCK_IDS,
  MAIN_INVENTORY_SLOT_COUNT,
  addInventoryItem,
  createDefaultInventory,
  interactInventorySlot,
  normalizeInventorySnapshot,
  setSelectedInventorySlot,
} from "../src/world/inventory.ts";

test("default inventory creates a full hotbar plus empty main inventory", () => {
  const inventory = createDefaultInventory();

  expect(inventory.hotbar).toHaveLength(9);
  expect(inventory.hotbar.map((slot) => slot.blockId)).toEqual([...HOTBAR_BLOCK_IDS]);
  expect(inventory.hotbar.every((slot) => slot.count === DEFAULT_INVENTORY_STACK_SIZE)).toBe(true);
  expect(inventory.main).toHaveLength(MAIN_INVENTORY_SLOT_COUNT);
  expect(inventory.main.every((slot) => slot.blockId === 0 && slot.count === 0)).toBe(true);
  expect(inventory.selectedSlot).toBe(0);
  expect(inventory.cursor).toBeNull();
});

test("inventory normalization clamps counts and fills missing slots safely", () => {
  const inventory = normalizeInventorySnapshot({
    hotbar: [
      { blockId: 1, count: 3 },
      { blockId: 2, count: 4 },
      { blockId: 3, count: 5 },
      { blockId: 4, count: 6 },
      { blockId: 5, count: 700 },
    ],
    main: [{ blockId: 9, count: 2 }],
    selectedSlot: 99,
    cursor: { blockId: 7, count: 3 },
  });

  expect(inventory.hotbar).toHaveLength(9);
  expect(inventory.main).toHaveLength(MAIN_INVENTORY_SLOT_COUNT);
  expect(inventory.hotbar.find((slot) => slot.blockId === 1)?.count).toBe(3);
  expect(inventory.hotbar.find((slot) => slot.blockId === 5)?.count).toBe(DEFAULT_INVENTORY_STACK_SIZE);
  expect(inventory.hotbar[5]).toEqual({ blockId: 0, count: 0 });
  expect(inventory.hotbar[8]).toEqual({ blockId: 0, count: 0 });
  expect(inventory.main[0]).toEqual({ blockId: 9, count: 2 });
  expect(inventory.selectedSlot).toBe(8);
  expect(inventory.cursor).toEqual({ blockId: 7, count: 3 });
});

test("selected slot clamps across the nine-slot hotbar range", () => {
  const inventory = createDefaultInventory();

  expect(setSelectedInventorySlot(inventory, -5).selectedSlot).toBe(0);
  expect(setSelectedInventorySlot(inventory, 8).selectedSlot).toBe(8);
  expect(setSelectedInventorySlot(inventory, 200).selectedSlot).toBe(8);
});

test("adding items fills empty main-inventory stacks when hotbar stacks are full", () => {
  const inventory = createDefaultInventory();
  const result = addInventoryItem(inventory, 1, 5);

  expect(result.added).toBe(5);
  expect(result.remaining).toBe(0);
  expect(result.inventory.main[0]).toEqual({ blockId: 1, count: 5 });
});

test("inventory interaction picks up, places, and merges stacks", () => {
  let inventory = createDefaultInventory();
  inventory = interactInventorySlot(inventory, "hotbar", 0);

  expect(inventory.cursor).toEqual({ blockId: 1, count: 64 });
  expect(inventory.hotbar[0]).toEqual({ blockId: 0, count: 0 });

  inventory = interactInventorySlot(inventory, "main", 0);
  expect(inventory.cursor).toBeNull();
  expect(inventory.main[0]).toEqual({ blockId: 1, count: 64 });

  inventory = normalizeInventorySnapshot({
    hotbar: [
      { blockId: 1, count: 24 },
      ...createDefaultInventory().hotbar.slice(1),
    ],
    main: [
      { blockId: 1, count: 12 },
      ...Array.from(
        { length: MAIN_INVENTORY_SLOT_COUNT - 1 },
        (): InventorySlot => ({ blockId: 0, count: 0 }),
      ),
    ],
    selectedSlot: 0,
    cursor: null,
  });

  inventory = interactInventorySlot(inventory, "main", 0);
  expect(inventory.cursor).toEqual({ blockId: 1, count: 12 });
  inventory = interactInventorySlot(inventory, "hotbar", 0);
  expect(inventory.hotbar[0]).toEqual({ blockId: 1, count: 36 });
  expect(inventory.cursor).toBeNull();
});
