import { expect, test } from "bun:test";
import { getHeldItemBlockId, collectVisibleRemotePlayers } from "../src/render/player-model.ts";
import type { PlayerSnapshot } from "../src/types.ts";
import { createDefaultInventory, setSelectedInventorySlot } from "../src/world/inventory.ts";

const createPlayerSnapshot = (
  entityId: string,
  name: string,
  position: [number, number, number],
  active = true,
): PlayerSnapshot => ({
  entityId,
  name,
  active,
  gamemode: 0,
  flying: false,
  state: {
    position,
    yaw: 0,
    pitch: 0,
  },
});

test("collectVisibleRemotePlayers excludes the local player and out-of-range players", () => {
  const local = createPlayerSnapshot("player:1", "Developer", [0, 64, 0]);
  const bob = createPlayerSnapshot("player:2", "Bob", [12, 64, 12]);
  const alice = createPlayerSnapshot("player:3", "Alice", [8, 64, 0]);
  const inactive = createPlayerSnapshot("player:4", "Idle", [4, 64, 4], false);
  const distant = createPlayerSnapshot("player:5", "Far", [80, 64, 0]);

  expect(
    collectVisibleRemotePlayers(
      [local, bob, alice, inactive, distant],
      local.entityId,
      local.state.position,
      2,
    ).map((player) => player.name),
  ).toEqual(["Alice", "Bob"]);
});

test("collectVisibleRemotePlayers includes active players when no local entity id is known", () => {
  const alpha = createPlayerSnapshot("player:2", "Alpha", [0, 64, 0]);
  const bravo = createPlayerSnapshot("player:3", "Bravo", [31, 64, 31]);

  expect(
    collectVisibleRemotePlayers(
      [bravo, alpha],
      null,
      [0, 64, 0],
      2,
    ).map((player) => player.name),
  ).toEqual(["Alpha", "Bravo"]);
});

test("getHeldItemBlockId follows the selected hotbar slot and treats empty slots as no held item", () => {
  const inventory = setSelectedInventorySlot(createDefaultInventory(), 4);
  expect(getHeldItemBlockId(inventory)).toBe(5);

  const emptySelected = {
    ...inventory,
    hotbar: inventory.hotbar.map((slot, index) =>
      index === 4 ? { itemId: 0 as const, count: 0 } : { ...slot }
    ),
  };
  expect(getHeldItemBlockId(emptySelected)).toBeNull();
});
