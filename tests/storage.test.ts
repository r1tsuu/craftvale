import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BinaryWorldStorage } from "../src/server/world-storage.ts";
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
          { blockId: 1, count: 3 },
          { blockId: 2, count: 4 },
          { blockId: 3, count: 5 },
          { blockId: 4, count: 6 },
          { blockId: 5, count: 7 },
        ],
        main: [{ blockId: 6, count: 9 }],
        selectedSlot: 2,
        cursor: { blockId: 7, count: 2 },
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
        hotbar: [{ blockId: 4, count: 9 }],
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
    expect(loadedPlayerA?.inventory.hotbar.find((slot) => slot.blockId === 3)?.count).toBe(5);
    expect(loadedPlayerA?.inventory.main.find((slot) => slot.blockId === 6)?.count).toBe(9);
    expect(loadedPlayerA?.inventory.cursor).toEqual({ blockId: 7, count: 2 });

    const loadedPlayerB = await storage.loadPlayer("Alpha", PLAYER_B);
    expect(loadedPlayerB).not.toBeNull();
    expect(loadedPlayerB?.snapshot.entityId).toBe("player:8");
    expect(loadedPlayerB?.snapshot.gamemode).toBe(0);
    expect(loadedPlayerB?.snapshot.state.position).toEqual([1, 2, 3]);
    expect(loadedPlayerB?.inventory.hotbar.find((slot) => slot.blockId === 4)?.count).toBe(9);

    await storage.saveDroppedItems("Alpha", [
      {
        entityId: "drop:3",
        position: [4.5, 65.25, -2.5],
        velocity: [0.5, 1.75, -0.25],
        blockId: 3,
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
        blockId: 3,
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
