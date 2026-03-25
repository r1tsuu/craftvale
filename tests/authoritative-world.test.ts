import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthoritativeWorld } from "../packages/core/src/server/authoritative-world.ts";
import { BinaryWorldStorage } from "../packages/core/src/server/world-storage.ts";
import { getDroppedItemIdForBlock } from "../packages/core/src/world/blocks.ts";
import { CHUNK_SIZE } from "../packages/core/src/world/constants.ts";
import { getTerrainHeight } from "../packages/core/src/world/terrain.ts";
import type { BlockId } from "../packages/core/src/types.ts";

const PLAYER_A = "Alice";
const PLAYER_B = "Bob";

test("authoritative world keeps per-player state separate and persists it by player name", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "craftvale-authoritative-world-"));
  const storage = new BinaryWorldStorage(rootDir);

  try {
    const worldRecord = await storage.createWorld("Alpha", 42);
    const world = new AuthoritativeWorld(worldRecord, storage);

    const joinedA = await world.joinPlayer(PLAYER_A);
    expect(joinedA.clientPlayer.name).toBe(PLAYER_A);
    expect(joinedA.players).toEqual([]);
    expect(joinedA.droppedItems).toEqual([]);
    expect(joinedA.clientPlayer.gamemode).toBe(0);
    expect(joinedA.clientPlayer.entityId).toMatch(/^player:/);

    await world.setPlayerGamemode(joinedA.clientPlayer.entityId, 1);
    await world.updatePlayerState(
      joinedA.clientPlayer.entityId,
      {
        position: [20, 80, -4],
        yaw: 0.75,
        pitch: -0.2,
      },
      true,
    );
    const playerAInventory = await world.selectInventorySlot(joinedA.clientPlayer.entityId, 4);
    expect(playerAInventory.selectedSlot).toBe(4);
    const liftedStack = await world.interactInventorySlot(joinedA.clientPlayer.entityId, "hotbar", 8);
    expect(liftedStack.cursor).toEqual({ itemId: 109, count: 64 });
    const placedStack = await world.interactInventorySlot(joinedA.clientPlayer.entityId, "main", 0);
    expect(placedStack.cursor).toBeNull();
    expect(placedStack.main[0]).toEqual({ itemId: 109, count: 64 });

    const joinedB = await world.joinPlayer(PLAYER_B);
    expect(joinedB.clientPlayer.name).toBe(PLAYER_B);
    expect(joinedB.players.map((player) => player.name)).toEqual([PLAYER_A]);
    expect(joinedB.inventory.selectedSlot).toBe(0);
    expect(joinedB.clientPlayer.entityId).not.toBe(joinedA.clientPlayer.entityId);

    await world.save();
    await world.leavePlayer(joinedA.clientPlayer.entityId);
    await world.leavePlayer(joinedB.clientPlayer.entityId);

    const reloadedRecord = await storage.getWorld("Alpha");
    expect(reloadedRecord).not.toBeNull();
    const reloadedWorld = new AuthoritativeWorld(reloadedRecord!, storage);

    const rejoinedA = await reloadedWorld.joinPlayer(PLAYER_A);
    expect(rejoinedA.clientPlayer.entityId).toBe(joinedA.clientPlayer.entityId);
    expect(rejoinedA.clientPlayer.state.position).toEqual([20, 80, -4]);
    expect(rejoinedA.clientPlayer.state.yaw).toBe(0.75);
    expect(rejoinedA.clientPlayer.gamemode).toBe(1);
    expect(rejoinedA.clientPlayer.flying).toBe(false);
    expect(rejoinedA.inventory.selectedSlot).toBe(4);
    expect(rejoinedA.inventory.main[0]).toEqual({ itemId: 109, count: 64 });

    const rejoinedB = await reloadedWorld.joinPlayer(PLAYER_B);
    expect(rejoinedB.clientPlayer.entityId).toBe(joinedB.clientPlayer.entityId);
    expect(rejoinedB.clientPlayer.state.position).not.toEqual([20, 80, -4]);
    expect(rejoinedB.inventory.selectedSlot).toBe(0);
    expect(rejoinedB.players.map((player) => player.name)).toEqual([PLAYER_A]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("authoritative world spawns and persists dropped items until players pick them up", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "craftvale-authoritative-world-drops-"));
  const storage = new BinaryWorldStorage(rootDir);

  try {
    const worldRecord = await storage.createWorld("Drops", 42);
    const world = new AuthoritativeWorld(worldRecord, storage);
    const joined = await world.joinPlayer(PLAYER_A);

    const targetX = 1;
    const targetZ = 1;
    const targetY = getTerrainHeight(worldRecord.seed, targetX, targetZ);
    const chunk = await world.getChunkPayload({ x: 0, y: 0, z: 0 });
    const localIndex = targetX + (targetZ * CHUNK_SIZE) + (targetY * CHUNK_SIZE * CHUNK_SIZE);
    const blockId = chunk.blocks[localIndex] as BlockId;
    expect(blockId).not.toBe(0);
    const droppedItemId = getDroppedItemIdForBlock(blockId);
    expect(droppedItemId).not.toBeNull();

    const broken = await world.applyBlockMutation(
      joined.clientPlayer.entityId,
      targetX,
      targetY,
      targetZ,
      0,
    );
    expect(broken.inventoryChanged).toBe(false);
    expect(broken.droppedItems.spawnedDroppedItems).toHaveLength(1);
    expect(broken.droppedItems.spawnedDroppedItems[0]?.itemId).toBe(droppedItemId!);

    await world.save();

    const reloadedRecord = await storage.getWorld("Drops");
    expect(reloadedRecord).not.toBeNull();
    const reloadedWorld = new AuthoritativeWorld(reloadedRecord!, storage);
    const rejoined = await reloadedWorld.joinPlayer(PLAYER_A);
    expect(rejoined.droppedItems).toHaveLength(1);
    expect(rejoined.droppedItems[0]?.itemId).toBe(droppedItemId!);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("authoritative world pregenerates and persists the startup chunk set", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "craftvale-authoritative-world-startup-"));
  const storage = new BinaryWorldStorage(rootDir);

  try {
    const worldRecord = await storage.createWorld("Startup", 42);
    const world = new AuthoritativeWorld(worldRecord, storage);
    const expectedCoords = world.getStartupChunkCoords();
    const progress: Array<{ completedChunks: number; totalChunks: number }> = [];

    const pregenerated = await world.pregenerateStartupArea(
      world.spawnPosition,
      undefined,
      (update) => {
        progress.push(update);
      },
    );

    expect(pregenerated.coords).toEqual(expectedCoords);
    expect(pregenerated.savedChunks).toBe(expectedCoords.length);
    expect(progress[0]).toEqual({
      completedChunks: 0,
      totalChunks: expectedCoords.length,
    });
    expect(progress.at(-1)).toEqual({
      completedChunks: expectedCoords.length,
      totalChunks: expectedCoords.length,
    });

    for (const coord of expectedCoords) {
      await expect(storage.loadChunk(worldRecord.name, coord)).resolves.toEqual(
        expect.objectContaining({
          coord,
        }),
      );
    }

    const secondPass = await world.pregenerateStartupArea();
    expect(secondPass.savedChunks).toBe(0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("survival cannot break bedrock but creative can", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "craftvale-authoritative-world-bedrock-"));
  const storage = new BinaryWorldStorage(rootDir);

  try {
    const worldRecord = await storage.createWorld("Bedrock", 42);
    const world = new AuthoritativeWorld(worldRecord, storage);
    const joined = await world.joinPlayer(PLAYER_A);
    const targetIndex = 1 + (1 * CHUNK_SIZE) + (0 * CHUNK_SIZE * CHUNK_SIZE);

    const survivalAttempt = await world.applyBlockMutation(
      joined.clientPlayer.entityId,
      1,
      0,
      1,
      0,
    );
    expect(survivalAttempt.changedChunks).toEqual([]);
    expect(survivalAttempt.droppedItems.spawnedDroppedItems).toEqual([]);

    const unchangedChunk = await world.getChunkPayload({ x: 0, y: 0, z: 0 });
    expect(unchangedChunk.blocks[targetIndex]).toBe(10);

    await world.setPlayerGamemode(joined.clientPlayer.entityId, 1);
    const creativeAttempt = await world.applyBlockMutation(
      joined.clientPlayer.entityId,
      1,
      0,
      1,
      0,
    );
    expect(creativeAttempt.changedChunks).toHaveLength(1);
    expect(creativeAttempt.droppedItems.spawnedDroppedItems).toEqual([]);

    const changedChunk = await world.getChunkPayload({ x: 0, y: 0, z: 0 });
    expect(changedChunk.blocks[targetIndex]).toBe(0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
