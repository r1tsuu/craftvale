import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerToClientMessage } from "../src/shared/messages.ts";
import { WorkerServerHost, type WorkerInboundMessage } from "../src/server/worker-host.ts";

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
      type: "listWorlds",
      payload: {},
    } as WorkerInboundMessage)).toThrow("before initialization");
});

test("worker host initializes once and dispatches requests through owned instance state", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-worker-host-"));
  const { scope, messages } = createScope();
  const host = new WorkerServerHost(scope);

  try {
    host.handleMessage({
      kind: "internal:init",
      storageRoot: rootDir,
    });
    host.handleMessage({
      kind: "internal:init",
      storageRoot: rootDir,
    });

    host.handleMessage({
      kind: "request",
      id: "req-1",
      type: "listWorlds",
      payload: {},
    });
    await Bun.sleep(0);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      kind: "response",
      id: "req-1",
      type: "listWorlds",
      ok: true,
      payload: {
        worlds: [],
      },
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
