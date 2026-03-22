import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BinaryWorldStorage } from "../src/server/world-storage.ts";
import { CHUNK_VOLUME } from "../src/world/constants.ts";

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

    await storage.saveInventory("Alpha", {
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

    const loadedInventory = await storage.loadInventory("Alpha");
    expect(loadedInventory).not.toBeNull();
    expect(loadedInventory?.inventory.selectedSlot).toBe(2);
    expect(loadedInventory?.inventory.slots.find((slot) => slot.blockId === 3)?.count).toBe(5);

    const deleted = await storage.deleteWorld("Alpha");
    expect(deleted).toBe(true);
    expect(await storage.listWorlds()).toEqual([]);
    expect(await storage.loadChunk("Alpha", { x: 0, y: 0, z: 0 })).toBeNull();
    expect(await storage.loadInventory("Alpha")).toBeNull();
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
