import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortClientAdapter } from "../src/client/client-adapter.ts";
import { ClientWorldRuntime } from "../src/client/world-runtime.ts";
import type { ClientToServerMessage, ServerToClientMessage } from "../src/shared/messages.ts";
import { createInMemoryTransportPair } from "../src/shared/transport.ts";
import { PortServerAdapter } from "../src/server/server-adapter.ts";
import { ServerRuntime } from "../src/server/runtime.ts";
import { BinaryWorldStorage } from "../src/server/world-storage.ts";
import { DEFAULT_INVENTORY_STACK_SIZE } from "../src/world/inventory.ts";
import { getTerrainHeight } from "../src/world/terrain.ts";

const PLAYER_NAME = "Alice";

const createHarness = async (): Promise<{
  rootDir: string;
  transport: ReturnType<
    typeof createInMemoryTransportPair<
      ServerToClientMessage,
      ClientToServerMessage,
      ClientToServerMessage,
      ServerToClientMessage
    >
  >;
  client: PortClientAdapter;
  worldRuntime: ClientWorldRuntime;
  serverRuntime: ServerRuntime;
}> => {
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-runtime-"));
  const transport = createInMemoryTransportPair<
    ServerToClientMessage,
    ClientToServerMessage,
    ClientToServerMessage,
    ServerToClientMessage
  >();
  const client = new PortClientAdapter(transport.left);
  const server = new PortServerAdapter(transport.right);
  const worldRuntime = new ClientWorldRuntime(client);
  const serverRuntime = new ServerRuntime(server, new BinaryWorldStorage(rootDir));

  client.eventBus.on("chunkDelivered", ({ chunk }) => {
    worldRuntime.applyChunk(chunk);
  });
  client.eventBus.on("chunkChanged", ({ chunk }) => {
    worldRuntime.applyChunk(chunk);
  });
  client.eventBus.on("inventoryUpdated", ({ playerEntityId, inventory }) => {
    if (playerEntityId === worldRuntime.clientPlayerEntityId) {
      worldRuntime.applyInventory(inventory);
    }
  });
  client.eventBus.on("playerJoined", ({ player }) => {
    worldRuntime.applyPlayer(player);
  });
  client.eventBus.on("playerUpdated", ({ player }) => {
    worldRuntime.applyPlayer(player);
  });
  client.eventBus.on("playerLeft", ({ playerEntityId, playerName }) => {
    worldRuntime.removePlayer(playerEntityId, playerName);
  });
  client.eventBus.on("chatMessage", ({ entry }) => {
    worldRuntime.appendChatMessage(entry);
  });

  return {
    rootDir,
    transport,
    client,
    worldRuntime,
    serverRuntime,
  };
};

test("client/server request-response correlation and error events work", async () => {
  const harness = await createHarness();

  try {
    await Promise.all([
      harness.client.eventBus.send({
        type: "createWorld",
        payload: { name: "Alpha", seed: 1 },
      }),
      harness.client.eventBus.send({
        type: "createWorld",
        payload: { name: "Bravo", seed: 2 },
      }),
    ]);

    const listed = await harness.client.eventBus.send({
      type: "listWorlds",
      payload: {},
    });
    expect(listed.worlds.map((world) => world.name)).toEqual(["Alpha", "Bravo"]);

    let serverErrorMessage = "";
    harness.client.eventBus.on("serverError", ({ message }) => {
      serverErrorMessage = message;
    });

    harness.transport.left.postMessage({
      kind: "request",
      id: "invalid-request",
      type: "unknownRequest",
      payload: {},
    } as never);
    await Bun.sleep(0);
    expect(serverErrorMessage).toContain("Unknown request type");
  } finally {
    await harness.serverRuntime.shutdown();
    harness.client.close();
    await rm(harness.rootDir, { recursive: true, force: true });
  }
});

test("authoritative chunk delivery and mutation updates the replicated client world", async () => {
  const harness = await createHarness();

  try {
    await harness.client.eventBus.send({
      type: "createWorld",
      payload: { name: "Alpha", seed: 42 },
    });

    const joined = await harness.client.eventBus.send({
        type: "joinWorld",
        payload: {
          name: "Alpha",
          playerName: PLAYER_NAME,
        },
      });
    harness.worldRuntime.reset();
    harness.worldRuntime.applyJoinedWorld(joined);

    const coords = [{ x: 0, y: 0, z: 0 }];
    await harness.worldRuntime.requestMissingChunks(coords);
    await harness.worldRuntime.waitForChunks(coords);

    expect(harness.worldRuntime.world.hasChunk(coords[0]!)).toBe(true);
    expect(joined.clientPlayerName).toBe(PLAYER_NAME);
    expect(joined.clientPlayer.entityId).toMatch(/^player:/);
    expect(harness.worldRuntime.clientPlayerName).toBe(PLAYER_NAME);
    expect(harness.worldRuntime.clientPlayerEntityId).toBe(joined.clientPlayer.entityId);
    expect(harness.worldRuntime.getClientPlayer()?.name).toBe(PLAYER_NAME);
    expect(harness.worldRuntime.getClientPlayer()?.entityId).toBe(joined.clientPlayer.entityId);
    expect(harness.worldRuntime.inventory.selectedSlot).toBe(0);
    expect(
      harness.worldRuntime.inventory.hotbar.every(
        (slot) => slot.count === DEFAULT_INVENTORY_STACK_SIZE,
      ),
    ).toBe(true);
    expect(
      harness.worldRuntime.inventory.main.every(
        (slot) => slot.blockId === 0 && slot.count === 0,
      ),
    ).toBe(true);

    const targetY = getTerrainHeight(joined.world.seed, 1, 1);
    const targetBlockId = harness.worldRuntime.world.getBlock(1, targetY, 1);
    expect(targetBlockId).not.toBe(0);

    let changedChunkReceived = false;
    harness.client.eventBus.on("chunkChanged", () => {
      changedChunkReceived = true;
    });

    harness.client.eventBus.send({
      type: "updatePlayerState",
      payload: {
        state: {
          position: [14, joined.clientPlayer.state.position[1], -6],
          yaw: 0.5,
          pitch: -0.2,
        },
        flying: false,
      },
    });
    await Bun.sleep(0);
    expect(harness.worldRuntime.getClientPlayer()?.state.position).toEqual([
      14,
      joined.clientPlayer.state.position[1],
      -6,
    ]);

    harness.client.eventBus.send({
      type: "mutateBlock",
      payload: {
        x: 1,
        y: targetY,
        z: 1,
        blockId: 0,
      },
    });
    await Bun.sleep(0);

    expect(changedChunkReceived).toBe(true);
    expect(harness.worldRuntime.world.getBlock(1, targetY, 1)).toBe(0);
    const collectedSlot = harness.worldRuntime.inventory.main.find((slot) => slot.blockId === targetBlockId);
    expect(collectedSlot?.count).toBe(1);

    const collectedSlotIndex = harness.worldRuntime.inventory.hotbar.findIndex(
      (slot) => slot.blockId === targetBlockId,
    );
    harness.client.eventBus.send({
      type: "selectInventorySlot",
      payload: {
        slot: collectedSlotIndex,
      },
    });
    await Bun.sleep(0);
    expect(harness.worldRuntime.inventory.selectedSlot).toBe(collectedSlotIndex);

    harness.client.eventBus.send({
      type: "interactInventorySlot",
      payload: {
        section: "hotbar",
        slot: 8,
      },
    });
    await Bun.sleep(0);
    expect(harness.worldRuntime.inventory.cursor).toEqual({ blockId: 9, count: 64 });

    harness.client.eventBus.send({
      type: "interactInventorySlot",
      payload: {
        section: "main",
        slot: 1,
      },
    });
    await Bun.sleep(0);
    expect(harness.worldRuntime.inventory.cursor).toBeNull();
    expect(harness.worldRuntime.inventory.main[1]).toEqual({ blockId: 9, count: 64 });

    harness.client.eventBus.send({
      type: "interactInventorySlot",
      payload: {
        section: "main",
        slot: 1,
      },
    });
    await Bun.sleep(0);
    harness.client.eventBus.send({
      type: "interactInventorySlot",
      payload: {
        section: "hotbar",
        slot: 8,
      },
    });
    await Bun.sleep(0);
    expect(harness.worldRuntime.inventory.hotbar[8]).toEqual({ blockId: 9, count: 64 });
    expect(harness.worldRuntime.inventory.cursor).toBeNull();

    harness.client.eventBus.send({
      type: "selectInventorySlot",
      payload: {
        slot: 8,
      },
    });
    await Bun.sleep(0);
    expect(harness.worldRuntime.inventory.selectedSlot).toBe(8);

    harness.client.eventBus.send({
      type: "selectInventorySlot",
      payload: {
        slot: collectedSlotIndex,
      },
    });
    await Bun.sleep(0);
    expect(harness.worldRuntime.inventory.selectedSlot).toBe(collectedSlotIndex);

    harness.client.eventBus.send({
      type: "mutateBlock",
      payload: {
        x: 1,
        y: targetY,
        z: 1,
        blockId: targetBlockId,
      },
    });
    await Bun.sleep(0);

    expect(harness.worldRuntime.world.getBlock(1, targetY, 1)).toBe(targetBlockId);
    expect(
      harness.worldRuntime.inventory.hotbar.find((slot) => slot.blockId === targetBlockId)?.count,
    ).toBe(DEFAULT_INVENTORY_STACK_SIZE - 1);
    expect(
      harness.worldRuntime.inventory.main.find((slot) => slot.blockId === targetBlockId)?.count,
    ).toBe(1);

    harness.client.eventBus.send({
      type: "submitChat",
      payload: {
        text: "/gamemode 1",
      },
    });
    await Bun.sleep(0);
    expect(harness.worldRuntime.getClientPlayer()?.gamemode).toBe(1);
    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toContain("creative");

    harness.client.eventBus.send({
      type: "submitChat",
      payload: {
        text: "hello world",
      },
    });
    await Bun.sleep(0);
    expect(harness.worldRuntime.chatMessages.at(-1)).toEqual(
      expect.objectContaining({
        kind: "player",
        senderName: PLAYER_NAME,
        text: "hello world",
      }),
    );
  } finally {
    await harness.serverRuntime.shutdown();
    harness.client.close();
    await rm(harness.rootDir, { recursive: true, force: true });
  }
});
