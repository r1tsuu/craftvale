import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerToClientMessage } from "../src/shared/messages.ts";
import { WorkerServerHost, type WorkerInboundMessage } from "../src/server/worker-host.ts";
import { BinaryWorldStorage } from "../src/server/world-storage.ts";

const createScope = () => {
  const messages: ServerToClientMessage[] = [];
  let closed = false;

  return {
    scope: {
      postMessage(message: ServerToClientMessage): void {
        messages.push(message);
      },
      close(): void {
        closed = true;
      },
    },
    messages,
    isClosed: (): boolean => closed,
  };
};

test("worker host rejects gameplay messages before initialization", () => {
  const { scope } = createScope();
  const host = new WorkerServerHost(scope);

  expect(() =>
    host.handleMessage({
      kind: "request",
      id: "req-1",
      type: "joinWorld",
      payload: { playerName: "Alice" },
    } as WorkerInboundMessage)).toThrow("before initialization");
});

test("worker host initializes once and dispatches requests through owned instance state", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-worker-host-"));
  const { scope, messages } = createScope();
  const host = new WorkerServerHost(scope);
  const storage = new BinaryWorldStorage(rootDir);

  try {
    const world = await storage.createWorld("Alpha", 42);
    host.handleMessage({
      kind: "internal:init",
      storageRoot: rootDir,
      world,
    });
    host.handleMessage({
      kind: "internal:init",
      storageRoot: rootDir,
      world,
    });

    host.handleMessage({
      kind: "request",
      id: "req-1",
      type: "joinWorld",
      payload: { playerName: "Alice" },
    });
    await Bun.sleep(0);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.kind).toBe("event");
    expect(messages[0]).toEqual({
      kind: "event",
      type: "joinedWorld",
      payload: expect.objectContaining({
        world: expect.objectContaining({
          name: "Alpha",
          seed: 42,
        }),
        clientPlayerName: "Alice",
      }),
    });
    expect(messages[1]?.kind).toBe("response");
    if (messages[1]?.kind !== "response") {
      throw new Error("Expected a response message.");
    }
    expect(messages[1].id).toBe("req-1");
    expect(messages[1].type).toBe("joinWorld");
    expect(messages[1].ok).toBe(true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
