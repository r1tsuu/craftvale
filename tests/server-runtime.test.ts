import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortClientAdapter } from "../apps/client/src/client/client-adapter.ts";
import { AuthoritativeWorld } from "../packages/core/src/server/authoritative-world.ts";
import { PortServerAdapter } from "../packages/core/src/server/server-adapter.ts";
import { ServerRuntime } from "../packages/core/src/server/runtime.ts";
import { BinaryWorldStorage } from "../packages/core/src/server/world-storage.ts";
import type { ClientToServerMessage, ServerToClientMessage } from "../packages/core/src/shared/messages.ts";
import { createInMemoryTransportPair } from "../packages/core/src/shared/transport.ts";

test("server runtime applies queued gameplay only on tick boundaries and preserves order within a tick", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-server-runtime-"));
  let nowMs = 0;

  try {
    const transport = createInMemoryTransportPair<
      ServerToClientMessage,
      ClientToServerMessage,
      ClientToServerMessage,
      ServerToClientMessage
    >();
    const client = new PortClientAdapter(transport.left);
    const server = new PortServerAdapter(transport.right);
    const storage = new BinaryWorldStorage(rootDir);
    const worldRecord = await storage.createWorld("Alpha", 42);
    const runtime = new ServerRuntime(server, new AuthoritativeWorld(worldRecord, storage), {
      autoStart: false,
      now: () => nowMs,
      tickIntervalMs: 50,
    });

    const selectedSlots: number[] = [];
    client.eventBus.on("inventoryUpdated", ({ inventory }) => {
      selectedSlots.push(inventory.selectedSlot);
    });

    const joined = await client.eventBus.send({
      type: "joinWorld",
      payload: {
        playerName: "Alice",
      },
    });
    expect(joined.inventory.selectedSlot).toBe(0);

    client.eventBus.send({
      type: "selectInventorySlot",
      payload: {
        slot: 4,
      },
    });
    client.eventBus.send({
      type: "selectInventorySlot",
      payload: {
        slot: 2,
      },
    });
    await Bun.sleep(0);

    expect(selectedSlots).toEqual([]);

    nowMs = 50;
    await runtime.processPendingTicks(nowMs);
    await Bun.sleep(0);

    expect(selectedSlots).toEqual([2]);
    await runtime.shutdown();
    client.close();
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("server runtime caps catch-up work when the authoritative tick loop falls behind", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-server-runtime-cap-"));
  let nowMs = 0;

  try {
    const storage = new BinaryWorldStorage(rootDir);
    const worldRecord = await storage.createWorld("Alpha", 42);
    const runtime = new ServerRuntime(null, new AuthoritativeWorld(worldRecord, storage), {
      autoStart: false,
      now: () => nowMs,
      tickIntervalMs: 50,
      maxCatchUpTicks: 3,
    });

    nowMs = 500;
    const ticksRun = await runtime.processPendingTicks(nowMs);
    const stats = runtime.getTickStats();

    expect(ticksRun).toBe(3);
    expect(stats.tickCount).toBe(3);
    expect(stats.droppedCatchUpTicks).toBe(7);
    expect(stats.accumulatorMs).toBeLessThan(50);

    await runtime.shutdown();
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
