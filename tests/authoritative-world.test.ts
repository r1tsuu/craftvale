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

    await world.updatePlayerState(PLAYER_A, {
      position: [20, 80, -4],
      yaw: 0.75,
      pitch: -0.2,
    });
    const playerAInventory = await world.selectInventorySlot(PLAYER_A, 4);
    expect(playerAInventory.selectedSlot).toBe(4);

    const joinedB = await world.joinPlayer(PLAYER_B);
    expect(joinedB.clientPlayer.name).toBe(PLAYER_B);
    expect(joinedB.players.map((player) => player.name)).toEqual([PLAYER_A]);
    expect(joinedB.inventory.selectedSlot).toBe(0);

    await world.save();
    await world.leavePlayer(PLAYER_A);
    await world.leavePlayer(PLAYER_B);

    const reloadedRecord = await storage.getWorld("Alpha");
    expect(reloadedRecord).not.toBeNull();
    const reloadedWorld = new AuthoritativeWorld(reloadedRecord!, storage);

    const rejoinedA = await reloadedWorld.joinPlayer(PLAYER_A);
    expect(rejoinedA.clientPlayer.state.position).toEqual([20, 80, -4]);
    expect(rejoinedA.clientPlayer.state.yaw).toBe(0.75);
    expect(rejoinedA.inventory.selectedSlot).toBe(4);

    const rejoinedB = await reloadedWorld.joinPlayer(PLAYER_B);
    expect(rejoinedB.clientPlayer.state.position).not.toEqual([20, 80, -4]);
    expect(rejoinedB.inventory.selectedSlot).toBe(0);
    expect(rejoinedB.players.map((player) => player.name)).toEqual([PLAYER_A]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
