import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BinaryWorldStorage,
  DedicatedWorldStorage,
  DEDICATED_WORLD_DIRECTORY_NAME,
} from "../src/server/world-storage.ts";
import { CHUNK_VOLUME } from "../src/world/constants.ts";

const PLAYER_A = "Alice";
const PLAYER_B = "Bob Builder";

const createTempStorage = async (): Promise<{
  rootDir: string;
  storage: BinaryWorldStorage;
}> => {
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-storage-"));
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
    blocks[0] = 3;
    blocks[17] = 2;
    await storage.saveChunk("Alpha", {
      coord: { x: 0, y: 0, z: 0 },
      blocks,
      revision: 7,
    });

    const loaded = await storage.loadChunk("Alpha", { x: 0, y: 0, z: 0 });
    expect(loaded).not.toBeNull();
    expect(loaded?.revision).toBe(7);
    expect(loaded?.blocks[0]).toBe(3);
    expect(loaded?.blocks[17]).toBe(2);

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
        hotbar: [
          { itemId: 101, count: 3 },
          { itemId: 102, count: 4 },
          { itemId: 103, count: 5 },
          { itemId: 104, count: 6 },
          { itemId: 105, count: 7 },
        ],
        main: [{ itemId: 106, count: 9 }],
        selectedSlot: 2,
        cursor: { itemId: 107, count: 2 },
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
        hotbar: [{ itemId: 104, count: 9 }],
        main: [],
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
    expect(loadedPlayerA?.inventory.hotbar).toHaveLength(9);
    expect(loadedPlayerA?.inventory.main).toHaveLength(27);
    expect(loadedPlayerA?.inventory.hotbar.find((slot) => slot.itemId === 103)?.count).toBe(5);
    expect(loadedPlayerA?.inventory.main.find((slot) => slot.itemId === 106)?.count).toBe(9);
    expect(loadedPlayerA?.inventory.cursor).toEqual({ itemId: 107, count: 2 });

    const loadedPlayerB = await storage.loadPlayer("Alpha", PLAYER_B);
    expect(loadedPlayerB).not.toBeNull();
    expect(loadedPlayerB?.snapshot.entityId).toBe("player:8");
    expect(loadedPlayerB?.snapshot.gamemode).toBe(0);
    expect(loadedPlayerB?.snapshot.state.position).toEqual([1, 2, 3]);
    expect(loadedPlayerB?.inventory.hotbar.find((slot) => slot.itemId === 104)?.count).toBe(9);

    await storage.saveDroppedItems("Alpha", [
      {
        entityId: "drop:3",
        position: [4.5, 65.25, -2.5],
        velocity: [0.5, 1.75, -0.25],
        itemId: 103,
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
        itemId: 103,
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
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-dedicated-storage-"));
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
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-dedicated-storage-cache-"));
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
