import { expect, test } from "bun:test";
import {
  DEFAULT_INVENTORY_STACK_SIZE,
  HOTBAR_BLOCK_IDS,
  createDefaultInventory,
  normalizeInventorySnapshot,
  setSelectedInventorySlot,
} from "../src/world/inventory.ts";

test("default inventory creates nine full hotbar slots", () => {
  const inventory = createDefaultInventory();

  expect(inventory.slots).toHaveLength(9);
  expect(inventory.slots.map((slot) => slot.blockId)).toEqual([...HOTBAR_BLOCK_IDS]);
  expect(inventory.slots.every((slot) => slot.count === DEFAULT_INVENTORY_STACK_SIZE)).toBe(true);
  expect(inventory.selectedSlot).toBe(0);
});

test("inventory normalization preserves old slot counts and fills new block types with zero", () => {
  const inventory = normalizeInventorySnapshot({
    selectedSlot: 99,
    slots: [
      { blockId: 1, count: 3 },
      { blockId: 2, count: 4 },
      { blockId: 3, count: 5 },
      { blockId: 4, count: 6 },
      { blockId: 5, count: 7 },
    ],
  });

  expect(inventory.slots).toHaveLength(9);
  expect(inventory.slots.find((slot) => slot.blockId === 1)?.count).toBe(3);
  expect(inventory.slots.find((slot) => slot.blockId === 5)?.count).toBe(7);
  expect(inventory.slots.find((slot) => slot.blockId === 6)?.count).toBe(0);
  expect(inventory.slots.find((slot) => slot.blockId === 9)?.count).toBe(0);
  expect(inventory.selectedSlot).toBe(8);
});

test("selected slot clamps across the nine-slot range", () => {
  const inventory = createDefaultInventory();

  expect(setSelectedInventorySlot(inventory, -5).selectedSlot).toBe(0);
  expect(setSelectedInventorySlot(inventory, 8).selectedSlot).toBe(8);
  expect(setSelectedInventorySlot(inventory, 200).selectedSlot).toBe(8);
});
