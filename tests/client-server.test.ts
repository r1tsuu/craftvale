import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortClientAdapter } from "../apps/client/src/client/client-adapter.ts";
import { ClientWorldRuntime } from "../apps/client/src/client/world-runtime.ts";
import type {
  ClientToServerMessage,
  LoadingProgressPayload,
  ServerToClientMessage,
} from "../packages/core/src/shared/messages.ts";
import { createInMemoryTransportPair } from "../packages/core/src/shared/transport.ts";
import { AuthoritativeWorld } from "../packages/core/src/server/authoritative-world.ts";
import { PortServerAdapter } from "../packages/core/src/server/server-adapter.ts";
import { ServerRuntime } from "../packages/core/src/server/runtime.ts";
import { BinaryWorldStorage } from "../packages/core/src/server/world-storage.ts";
import { DEFAULT_INVENTORY_STACK_SIZE } from "../packages/core/src/world/inventory.ts";
import { getDroppedItemIdForBlock } from "../packages/core/src/world/blocks.ts";
import { getTerrainHeight } from "../packages/core/src/world/terrain.ts";

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
  loadingProgressEvents: LoadingProgressPayload[];
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
  const loadingProgressEvents: LoadingProgressPayload[] = [];
  const storage = new BinaryWorldStorage(rootDir);
  const worldRecord = await storage.createWorld("Alpha", 42);
  const serverRuntime = new ServerRuntime(server, new AuthoritativeWorld(worldRecord, storage));

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
  client.eventBus.on("droppedItemSpawned", ({ item }) => {
    worldRuntime.applyDroppedItem(item);
  });
  client.eventBus.on("droppedItemUpdated", ({ item }) => {
    worldRuntime.applyDroppedItem(item);
  });
  client.eventBus.on("droppedItemRemoved", ({ entityId }) => {
    worldRuntime.removeDroppedItem(entityId);
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
  client.eventBus.on("loadingProgress", (payload) => {
    loadingProgressEvents.push(payload);
  });

  return {
    rootDir,
    transport,
    client,
    worldRuntime,
    serverRuntime,
    loadingProgressEvents,
  };
};

test("client/server request-response correlation and error events work", async () => {
  const harness = await createHarness();

  try {
    const joined = await harness.client.eventBus.send({
      type: "joinWorld",
      payload: {
        playerName: PLAYER_NAME,
      },
    });
    expect(joined.world.name).toBe("Alpha");
    expect(harness.loadingProgressEvents.length).toBeGreaterThan(0);
    expect(harness.loadingProgressEvents[0]?.stage).toBe("preparing-world");
    expect(harness.loadingProgressEvents.at(-1)?.stage).toBe("ready");
    for (let index = 1; index < harness.loadingProgressEvents.length; index += 1) {
      expect(
        harness.loadingProgressEvents[index]!.completedUnits,
      ).toBeGreaterThanOrEqual(
        harness.loadingProgressEvents[index - 1]!.completedUnits,
      );
    }

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
    const joined = await harness.client.eventBus.send({
        type: "joinWorld",
        payload: {
          playerName: PLAYER_NAME,
        },
      });
    expect(harness.loadingProgressEvents.at(-1)?.stage).toBe("ready");
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
    expect(joined.droppedItems).toEqual([]);
    expect(harness.worldRuntime.droppedItems.size).toBe(0);
    expect(harness.worldRuntime.inventory.selectedSlot).toBe(0);
    expect(
      harness.worldRuntime.inventory.hotbar.every(
        (slot) => slot.count === DEFAULT_INVENTORY_STACK_SIZE,
      ),
    ).toBe(true);
    expect(
      harness.worldRuntime.inventory.main.every(
        (slot) => slot.itemId === 0 && slot.count === 0,
      ),
    ).toBe(true);

    const targetY = getTerrainHeight(joined.world.seed, 1, 1);
    const targetBlockId = harness.worldRuntime.world.getBlock(1, targetY, 1);
    const targetItemId = getDroppedItemIdForBlock(targetBlockId);
    expect(targetBlockId).not.toBe(0);
    expect(targetItemId).not.toBeNull();

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
    expect(
      harness.worldRuntime.inventory.main.every(
        (slot) => slot.itemId === 0 && slot.count === 0,
      ),
    ).toBe(true);
    expect(harness.worldRuntime.droppedItems.size).toBe(1);

    await Bun.sleep(300);
    const droppedItem = [...harness.worldRuntime.droppedItems.values()][0];
    expect(droppedItem).toBeDefined();
    harness.client.eventBus.send({
      type: "updatePlayerState",
      payload: {
        state: {
          position: [
            droppedItem!.position[0],
            Math.max(droppedItem!.position[1] - 0.9, 0),
            droppedItem!.position[2],
          ],
          yaw: 0.5,
          pitch: -0.2,
        },
        flying: false,
      },
    });
    await Bun.sleep(0);

    const collectedSlot = harness.worldRuntime.inventory.main.find((slot) => slot.itemId === targetItemId);
    expect(collectedSlot?.count).toBe(1);
    expect(harness.worldRuntime.droppedItems.size).toBe(0);

    const collectedSlotIndex = harness.worldRuntime.inventory.hotbar.findIndex(
      (slot) => slot.itemId === targetItemId,
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
    expect(harness.worldRuntime.inventory.cursor).toEqual({ itemId: 109, count: 64 });

    harness.client.eventBus.send({
      type: "interactInventorySlot",
      payload: {
        section: "main",
        slot: 1,
      },
    });
    await Bun.sleep(0);
    expect(harness.worldRuntime.inventory.cursor).toBeNull();
    expect(harness.worldRuntime.inventory.main[1]).toEqual({ itemId: 109, count: 64 });

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
    expect(harness.worldRuntime.inventory.hotbar[8]).toEqual({ itemId: 109, count: 64 });
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
      harness.worldRuntime.inventory.hotbar.find((slot) => slot.itemId === targetItemId)?.count,
    ).toBe(DEFAULT_INVENTORY_STACK_SIZE - 1);
    expect(
      harness.worldRuntime.inventory.main.find((slot) => slot.itemId === targetItemId)?.count,
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
