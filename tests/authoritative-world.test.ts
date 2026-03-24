import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthoritativeWorld } from "../src/server/authoritative-world.ts";
import { BinaryWorldStorage } from "../src/server/world-storage.ts";

const PLAYER_A = "Alice";
const PLAYER_B = "Bob";

test("authoritative world keeps per-player state separate and persists it by player name", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-authoritative-world-"));
  const storage = new BinaryWorldStorage(rootDir);

  try {
    const worldRecord = await storage.createWorld("Alpha", 42);
    const world = new AuthoritativeWorld(worldRecord, storage);

    const joinedA = await world.joinPlayer(PLAYER_A);
    expect(joinedA.clientPlayer.name).toBe(PLAYER_A);
    expect(joinedA.players).toEqual([]);
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
    expect(liftedStack.cursor).toEqual({ blockId: 9, count: 64 });
    const placedStack = await world.interactInventorySlot(joinedA.clientPlayer.entityId, "main", 0);
    expect(placedStack.cursor).toBeNull();
    expect(placedStack.main[0]).toEqual({ blockId: 9, count: 64 });

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
    expect(rejoinedA.inventory.main[0]).toEqual({ blockId: 9, count: 64 });

    const rejoinedB = await reloadedWorld.joinPlayer(PLAYER_B);
    expect(rejoinedB.clientPlayer.entityId).toBe(joinedB.clientPlayer.entityId);
    expect(rejoinedB.clientPlayer.state.position).not.toEqual([20, 80, -4]);
    expect(rejoinedB.inventory.selectedSlot).toBe(0);
    expect(rejoinedB.players.map((player) => player.name)).toEqual([PLAYER_A]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
