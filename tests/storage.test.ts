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
        selectedSlot: 2,
        slots: [
          { blockId: 1, count: 3 },
          { blockId: 2, count: 4 },
          { blockId: 3, count: 5 },
          { blockId: 4, count: 6 },
          { blockId: 5, count: 7 },
        ],
      },
    });

    await storage.savePlayer("Alpha", {
      snapshot: {
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
        selectedSlot: 0,
        slots: [{ blockId: 4, count: 9 }],
      },
    });

    const loadedPlayerA = await storage.loadPlayer("Alpha", PLAYER_A);
    expect(loadedPlayerA).not.toBeNull();
    expect(loadedPlayerA?.snapshot.name).toBe(PLAYER_A);
    expect(loadedPlayerA?.snapshot.active).toBe(false);
    expect(loadedPlayerA?.snapshot.gamemode).toBe(1);
    expect(loadedPlayerA?.snapshot.flying).toBe(false);
    expect(loadedPlayerA?.snapshot.state.position).toEqual([12.5, 70, -4.25]);
    expect(loadedPlayerA?.inventory.selectedSlot).toBe(2);
    expect(loadedPlayerA?.inventory.slots).toHaveLength(9);
    expect(loadedPlayerA?.inventory.slots.find((slot) => slot.blockId === 3)?.count).toBe(5);
    expect(loadedPlayerA?.inventory.slots.find((slot) => slot.blockId === 6)?.count).toBe(0);

    const loadedPlayerB = await storage.loadPlayer("Alpha", PLAYER_B);
    expect(loadedPlayerB).not.toBeNull();
    expect(loadedPlayerB?.snapshot.gamemode).toBe(0);
    expect(loadedPlayerB?.snapshot.state.position).toEqual([1, 2, 3]);
    expect(loadedPlayerB?.inventory.slots.find((slot) => slot.blockId === 4)?.count).toBe(9);

    const deleted = await storage.deleteWorld("Alpha");
    expect(deleted).toBe(true);
    expect(await storage.listWorlds()).toEqual([]);
    expect(await storage.loadChunk("Alpha", { x: 0, y: 0, z: 0 })).toBeNull();
    expect(await storage.loadPlayer("Alpha", PLAYER_A)).toBeNull();
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
