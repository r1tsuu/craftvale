import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BinaryWorldStorage,
  DedicatedWorldStorage,
  DEDICATED_WORLD_DIRECTORY_NAME,
} from "../packages/core/src/server/world-storage.ts";
import { setWorldTimeOfDay } from "../packages/core/src/shared/lighting.ts";
import { BLOCK_IDS } from "../packages/core/src/world/blocks.ts";
import { CHUNK_VOLUME } from "../packages/core/src/world/constants.ts";
import {
  getHotbarInventorySlots,
  getMainInventorySlots,
} from "../packages/core/src/world/inventory.ts";
import { ITEM_IDS } from "../packages/core/src/world/items.ts";

const PLAYER_A = "Alice";
const PLAYER_B = "Bob Builder";

const createTempStorage = async (): Promise<{
  rootDir: string;
  storage: BinaryWorldStorage;
}> => {
  const rootDir = await mkdtemp(join(tmpdir(), "craftvale-storage-"));
  return {
    rootDir,
    storage: new BinaryWorldStorage(rootDir),
  };
};

test("binary world storage creates, persists, and deletes worlds", async () => {
  const { rootDir, storage } = await createTempStorage();

  try {
    const created = await storage.createWorld("Alpha", 12345);
    expect(created.name).toBe("Alpha");
    expect(created.seed).toBe(12345);

    const worlds = await storage.listWorlds();
    expect(worlds).toHaveLength(1);
    expect(worlds[0]?.name).toBe("Alpha");

    const blocks = new Uint8Array(CHUNK_VOLUME);
    blocks[0] = BLOCK_IDS.stone;
    blocks[17] = BLOCK_IDS.dirt;
    await storage.saveChunk("Alpha", {
      coord: { x: 0, y: 0, z: 0 },
      blocks,
      skyLight: new Uint8Array(CHUNK_VOLUME).fill(15),
      blockLight: new Uint8Array(CHUNK_VOLUME).fill(2),
      revision: 7,
    });

    const loaded = await storage.loadChunk("Alpha", { x: 0, y: 0, z: 0 });
    expect(loaded).not.toBeNull();
    expect(loaded?.revision).toBe(7);
    expect(loaded?.blocks[0]).toBe(BLOCK_IDS.stone);
    expect(loaded?.blocks[17]).toBe(BLOCK_IDS.dirt);
    expect(loaded?.skyLight?.[0]).toBe(15);
    expect(loaded?.blockLight?.[0]).toBe(2);
    expect(loaded?.hasLightData).toBe(true);

    await storage.saveWorldTime("Alpha", setWorldTimeOfDay(18_000, 2));
    await expect(storage.loadWorldTime("Alpha")).resolves.toEqual({
      dayCount: 2,
      timeOfDayTicks: 18_000,
    });

    await storage.savePlayer("Alpha", {
      snapshot: {
        entityId: "player:7",
        name: PLAYER_A,
        active: true,
        gamemode: 1,
        flying: true,
        state: {
          position: [12.5, 70, -4.25],
          yaw: 1.25,
          pitch: -0.5,
        },
      },
      inventory: {
        slots: [
          { itemId: ITEM_IDS.grass, count: 3 },
          { itemId: ITEM_IDS.dirt, count: 4 },
          { itemId: ITEM_IDS.stone, count: 5 },
          { itemId: ITEM_IDS.log, count: 6 },
          { itemId: ITEM_IDS.leaves, count: 7 },
          { itemId: ITEM_IDS.empty, count: 0 },
          { itemId: ITEM_IDS.empty, count: 0 },
          { itemId: ITEM_IDS.empty, count: 0 },
          { itemId: ITEM_IDS.empty, count: 0 },
          { itemId: ITEM_IDS.sand, count: 9 },
        ],
        selectedSlot: 2,
        cursor: { itemId: ITEM_IDS.planks, count: 2 },
      },
    });

    await storage.savePlayer("Alpha", {
      snapshot: {
        entityId: "player:8",
        name: PLAYER_B,
        active: true,
        gamemode: 0,
        flying: false,
        state: {
          position: [1, 2, 3],
          yaw: 0.25,
          pitch: 0.1,
        },
      },
      inventory: {
        slots: [{ itemId: ITEM_IDS.log, count: 9 }],
        selectedSlot: 0,
        cursor: null,
      },
    });

    const loadedPlayerA = await storage.loadPlayer("Alpha", PLAYER_A);
    expect(loadedPlayerA).not.toBeNull();
    expect(loadedPlayerA?.snapshot.entityId).toBe("player:7");
    expect(loadedPlayerA?.snapshot.name).toBe(PLAYER_A);
    expect(loadedPlayerA?.snapshot.active).toBe(false);
    expect(loadedPlayerA?.snapshot.gamemode).toBe(1);
    expect(loadedPlayerA?.snapshot.flying).toBe(false);
    expect(loadedPlayerA?.snapshot.state.position).toEqual([12.5, 70, -4.25]);
    expect(loadedPlayerA?.inventory.selectedSlot).toBe(2);
    expect(getHotbarInventorySlots(loadedPlayerA!.inventory)).toHaveLength(9);
    expect(getMainInventorySlots(loadedPlayerA!.inventory)).toHaveLength(27);
    expect(getHotbarInventorySlots(loadedPlayerA!.inventory).find((slot) => slot.itemId === ITEM_IDS.stone)?.count).toBe(5);
    expect(getMainInventorySlots(loadedPlayerA!.inventory).find((slot) => slot.itemId === ITEM_IDS.sand)?.count).toBe(9);
    expect(loadedPlayerA?.inventory.cursor).toEqual({ itemId: ITEM_IDS.planks, count: 2 });

    const loadedPlayerB = await storage.loadPlayer("Alpha", PLAYER_B);
    expect(loadedPlayerB).not.toBeNull();
    expect(loadedPlayerB?.snapshot.entityId).toBe("player:8");
    expect(loadedPlayerB?.snapshot.gamemode).toBe(0);
    expect(loadedPlayerB?.snapshot.state.position).toEqual([1, 2, 3]);
    expect(getHotbarInventorySlots(loadedPlayerB!.inventory).find((slot) => slot.itemId === ITEM_IDS.log)?.count).toBe(9);

    await storage.saveDroppedItems("Alpha", [
      {
        entityId: "drop:3",
        position: [4.5, 65.25, -2.5],
        velocity: [0.5, 1.75, -0.25],
        itemId: ITEM_IDS.stone,
        count: 12,
        pickupCooldownMs: 180,
      },
    ]);

    const loadedDroppedItems = await storage.loadDroppedItems("Alpha");
    expect(loadedDroppedItems).toEqual([
      {
        entityId: "drop:3",
        position: [4.5, 65.25, -2.5],
        velocity: [0.5, 1.75, -0.25],
        itemId: ITEM_IDS.stone,
        count: 12,
        pickupCooldownMs: 180,
      },
    ]);

    const deleted = await storage.deleteWorld("Alpha");
    expect(deleted).toBe(true);
    expect(await storage.listWorlds()).toEqual([]);
    expect(await storage.loadChunk("Alpha", { x: 0, y: 0, z: 0 })).toBeNull();
    expect(await storage.loadPlayer("Alpha", PLAYER_A)).toBeNull();
    expect(await storage.loadDroppedItems("Alpha")).toEqual([]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("dedicated world storage uses one fixed world directory", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "craftvale-dedicated-storage-"));
  const storage = new DedicatedWorldStorage(rootDir);

  try {
    const created = await storage.createWorld("Server World", 77);
    expect(created.directoryName).toBe(DEDICATED_WORLD_DIRECTORY_NAME);

    const worlds = await storage.listWorlds();
    expect(worlds).toEqual([
      expect.objectContaining({
        name: "Server World",
        seed: 77,
      }),
    ]);

    const worldDir = await stat(join(rootDir, DEDICATED_WORLD_DIRECTORY_NAME));
    expect(worldDir.isDirectory()).toBe(true);
    await expect(stat(join(rootDir, "worlds"))).rejects.toBeDefined();
    await expect(stat(join(rootDir, "registry.bin"))).rejects.toBeDefined();
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("dedicated world storage keeps the current world record available after metadata is removed", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "craftvale-dedicated-storage-cache-"));
  const storage = new DedicatedWorldStorage(rootDir);

  try {
    await storage.createWorld("Server World", 77);
    await rm(join(rootDir, DEDICATED_WORLD_DIRECTORY_NAME, "metadata.bin"), {
      force: true,
    });

    const touched = await storage.touchWorld("Server World", 1234);
    expect(touched.name).toBe("Server World");
    expect(touched.updatedAt).toBe(1234);

    const worldDir = await stat(join(rootDir, DEDICATED_WORLD_DIRECTORY_NAME));
    expect(worldDir.isDirectory()).toBe(true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
