import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoadingProgressPayload, ServerToClientMessage } from "../packages/core/src/shared/messages.ts";
import { WorkerServerHost, type WorkerInboundMessage } from "../packages/core/src/server/worker-host.ts";
import { BinaryWorldStorage } from "../packages/core/src/server/world-storage.ts";

const isLoadingProgressEvent = (
  message: ServerToClientMessage,
): message is {
  kind: "event";
  type: "loadingProgress";
  payload: LoadingProgressPayload;
} => message.kind === "event" && message.type === "loadingProgress";

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
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const sawReadyEvent = messages.some(
        (message) => isLoadingProgressEvent(message) && message.payload.stage === "ready",
      );
      const sawJoinResponse = messages.some(
        (message) =>
          message.kind === "response" &&
          message.type === "joinWorld" &&
          message.ok,
      );
      if (sawReadyEvent && sawJoinResponse) {
        break;
      }

      await Bun.sleep(5);
    }

    const loadingProgressEvents = messages.filter(
      isLoadingProgressEvent,
    );
    const joinedWorldEvent = messages.find(
      (message) => message.kind === "event" && message.type === "joinedWorld",
    );
    const joinResponse = messages.find(
      (message) => message.kind === "response" && message.type === "joinWorld",
    );

    expect(loadingProgressEvents.length).toBeGreaterThan(0);
    expect(loadingProgressEvents[0]).toEqual({
      kind: "event",
      type: "loadingProgress",
      payload: expect.objectContaining({
        stage: "preparing-world",
        worldName: "Alpha",
      }),
    });
    expect(
      loadingProgressEvents.some(
        (message) => message.payload.stage === "ready",
      ),
    ).toBe(true);
    expect(joinedWorldEvent).toEqual({
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
    expect(joinResponse?.kind).toBe("response");
    if (joinResponse?.kind !== "response") {
      throw new Error("Expected a response message.");
    }
    expect(joinResponse.id).toBe("req-1");
    expect(joinResponse.type).toBe("joinWorld");
    expect(joinResponse.ok).toBe(true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
