import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortClientAdapter } from "../src/client/client-adapter.ts";
import { ClientWorldRuntime } from "../src/client/world-runtime.ts";
import {
  loadOrCreateDedicatedWorld,
  type DedicatedServerSessionHost,
} from "../src/server/dedicated-server.ts";
import { PortServerAdapter } from "../src/server/server-adapter.ts";
import type { ClientToServerMessage, ServerToClientMessage } from "../src/shared/messages.ts";
import { createInMemoryTransportPair } from "../src/shared/transport.ts";
import { WorldSessionController, type WorldSessionPeer } from "../src/server/world-session-controller.ts";
import {
  DedicatedWorldStorage,
  DEDICATED_WORLD_DIRECTORY_NAME,
} from "../src/server/world-storage.ts";

const registerRuntimeHandlers = (
  client: PortClientAdapter,
  runtime: ClientWorldRuntime,
): Array<() => void> => [
  client.eventBus.on("chunkDelivered", ({ chunk }) => {
    runtime.applyChunk(chunk);
  }),
  client.eventBus.on("chunkChanged", ({ chunk }) => {
    runtime.applyChunk(chunk);
  }),
  client.eventBus.on("inventoryUpdated", ({ playerEntityId, inventory }) => {
    if (playerEntityId === runtime.clientPlayerEntityId) {
      runtime.applyInventory(inventory);
    }
  }),
  client.eventBus.on("droppedItemSpawned", ({ item }) => {
    runtime.applyDroppedItem(item);
  }),
  client.eventBus.on("droppedItemUpdated", ({ item }) => {
    runtime.applyDroppedItem(item);
  }),
  client.eventBus.on("droppedItemRemoved", ({ entityId }) => {
    runtime.removeDroppedItem(entityId);
  }),
  client.eventBus.on("playerJoined", ({ player }) => {
    runtime.applyPlayer(player);
  }),
  client.eventBus.on("playerUpdated", ({ player }) => {
    runtime.applyPlayer(player);
  }),
  client.eventBus.on("playerLeft", ({ playerEntityId, playerName }) => {
    runtime.removePlayer(playerEntityId, playerName);
  }),
  client.eventBus.on("chatMessage", ({ entry }) => {
    runtime.appendChatMessage(entry);
  }),
];

const createDedicatedSessionHarness = (
  host: DedicatedServerSessionHost,
): {
  client: PortClientAdapter;
  runtime: ClientWorldRuntime;
  controller: WorldSessionController;
  cleanup: () => Promise<void>;
} => {
  const transport = createInMemoryTransportPair<
    ServerToClientMessage,
    ClientToServerMessage,
    ClientToServerMessage,
    ServerToClientMessage
  >();
  const client = new PortClientAdapter(transport.left);
  const runtime = new ClientWorldRuntime(client);
  const adapter = new PortServerAdapter(transport.right);
  let controller!: WorldSessionController;
  controller = new WorldSessionController(
    {
      contextLabel: host.contextLabel,
      getWorld: () => host.world,
      sendToPlayer: (playerEntityId, message) => {
        host.sendToPlayer(playerEntityId, message);
      },
      broadcast: (message, options) => {
        host.broadcast(message, options);
      },
      afterJoin: (player) => {
        host.broadcast(
          {
            type: "playerJoined",
            payload: { player },
          },
          { exclude: controller },
        );
      },
      afterLeave: (player) => {
        host.broadcast(
          {
            type: "playerLeft",
            payload: {
              playerEntityId: player.entityId,
              playerName: player.name,
            },
          },
          { exclude: controller },
        );
      },
    },
    adapter,
  );
  const unregisterJoinServer = adapter.eventBus.on("joinServer", async ({ playerName }) =>
    controller.join(playerName)
  );
  host.registerSession(controller);
  const unsubscribers = registerRuntimeHandlers(client, runtime);

  return {
    client,
    runtime,
    controller,
    cleanup: async () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      await controller.disconnect();
      unregisterJoinServer();
      controller.dispose();
      host.unregisterSession(controller);
      client.close();
    },
  };
};

test("dedicated multiplayer sessions share one generated world and only support joinServer", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-dedicated-"));
  const storage = new DedicatedWorldStorage(rootDir);

  try {
    const world = await loadOrCreateDedicatedWorld(storage, {
      worldName: "Server World",
      seed: 77,
    });
    const worlds = await storage.listWorlds();
    expect(worlds).toHaveLength(1);
    expect(worlds[0]?.name).toBe("Server World");
    expect(worlds[0]?.seed).toBe(77);
    const dedicatedWorldDir = await stat(join(rootDir, DEDICATED_WORLD_DIRECTORY_NAME));
    expect(dedicatedWorldDir.isDirectory()).toBe(true);
    await expect(stat(join(rootDir, "worlds"))).rejects.toBeDefined();
    await expect(stat(join(rootDir, "registry.bin"))).rejects.toBeDefined();

    const sessions = new Set<WorldSessionPeer>();

    const host: DedicatedServerSessionHost = {
      world,
      contextLabel: "server",
      registerSession(session) {
        sessions.add(session);
      },
      unregisterSession(session) {
        sessions.delete(session);
      },
      sendToPlayer(playerEntityId, message) {
        for (const session of sessions) {
          if (session.controlsPlayer(playerEntityId)) {
            session.sendEvent(message);
          }
        }
      },
      broadcast(message, options = {}) {
        for (const session of sessions) {
          if (options.exclude && session === options.exclude) {
            continue;
          }

          session.sendEvent(message);
        }
      },
    };

    const alice = createDedicatedSessionHarness(host);
    const bob = createDedicatedSessionHarness(host);
    let remoteLoadingProgressEvents = 0;
    alice.client.eventBus.on("loadingProgress", () => {
      remoteLoadingProgressEvents += 1;
    });

    try {
      const aliceJoined = await alice.client.eventBus.send({
        type: "joinServer",
        payload: {
          playerName: "Alice",
        },
      });
      alice.runtime.reset();
      alice.runtime.applyJoinedWorld(aliceJoined);

      expect(aliceJoined.world.name).toBe("Server World");
      expect(aliceJoined.world.seed).toBe(77);
      expect(aliceJoined.clientPlayer.name).toBe("Alice");
      expect(aliceJoined.players).toEqual([]);
      expect(remoteLoadingProgressEvents).toBe(0);

      const coords = [{ x: 0, y: 0, z: 0 }];
      await alice.runtime.requestMissingChunks(coords);
      await alice.runtime.waitForChunks(coords);
      expect(alice.runtime.world.hasChunk(coords[0]!)).toBe(true);

      const bobJoined = await bob.client.eventBus.send({
        type: "joinServer",
        payload: {
          playerName: "Bob",
        },
      });
      bob.runtime.reset();
      bob.runtime.applyJoinedWorld(bobJoined);

      expect(bobJoined.world.name).toBe("Server World");
      expect(bobJoined.players.map((player) => player.name)).toContain("Alice");
      expect(bobJoined.clientPlayer.name).toBe("Bob");

      await expect(
        bob.client.eventBus.send({
          type: "joinWorld",
          payload: {
            playerName: "Bob",
          },
        }),
      ).rejects.toThrow('Unknown request type "joinWorld".');
    } finally {
      await bob.cleanup();
      await alice.cleanup();
      await world.save();
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
