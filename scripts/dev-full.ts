const SERVER_PORT = 3210;
const SERVER_NAME = "Local Server";
const SERVER_ADDRESS = `127.0.0.1:${SERVER_PORT}`;
const SERVER_SHUTDOWN_TIMEOUT_MS = 3_000;
const SERVER_READY_TIMEOUT_MS = 5_000;
const SERVER_READY_POLL_INTERVAL_MS = 100;

const waitForServerReady = async (
  process: Bun.Subprocess,
  address: string,
  timeoutMs: number,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  const url = `ws://${address}/ws`;

  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Dedicated server exited before becoming ready (code ${process.exitCode}).`);
    }

    const ready = await new Promise<boolean>((resolve) => {
      const socket = new WebSocket(url);
      let settled = false;

      const finish = (value: boolean): void => {
        if (settled) {
          return;
        }

        settled = true;
        try {
          if (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
          ) {
            socket.close();
          }
        } catch {
          // Ignore close errors during readiness probing.
        }
        resolve(value);
      };

      socket.addEventListener(
        "open",
        () => {
          finish(true);
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          finish(false);
        },
        { once: true },
      );
      setTimeout(() => {
        finish(false);
      }, SERVER_READY_POLL_INTERVAL_MS);
    });

    if (ready) {
      return;
    }

    await Bun.sleep(SERVER_READY_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for dedicated server readiness at ${url}.`);
};

const server = Bun.spawn(
  ["bun", "run", "src/server/standalone-entry.ts", `--port=${SERVER_PORT}`],
  {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    env: {
      ...Bun.env,
      APP_ENV: "development",
    },
  },
);

await waitForServerReady(server, SERVER_ADDRESS, SERVER_READY_TIMEOUT_MS);

const client = Bun.spawn(
  ["bun", "run", "src/index.ts"],
  {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...Bun.env,
      APP_ENV: "development",
      APP_DEV_PREFILL_SERVER_NAME: SERVER_NAME,
      APP_DEV_PREFILL_SERVER_ADDRESS: SERVER_ADDRESS,
    },
  },
);

let shutdownStarted = false;

const waitForExitOrTimeout = async (
  process: Bun.Subprocess,
  timeoutMs: number,
): Promise<boolean> => {
  const result = await Promise.race([
    process.exited.then(() => "exited" as const),
    Bun.sleep(timeoutMs).then(() => "timeout" as const),
  ]);
  return result === "exited";
};

const shutdown = async (): Promise<void> => {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;

  if (!client.killed) {
    client.kill("SIGTERM");
    await waitForExitOrTimeout(client, 500);
  }

  if (!server.killed) {
    server.kill("SIGTERM");
    const exitedGracefully = await waitForExitOrTimeout(
      server,
      SERVER_SHUTDOWN_TIMEOUT_MS,
    );
    if (!exitedGracefully && !server.killed) {
      server.kill("SIGKILL");
      await server.exited;
    }
  }
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

const exitCode = await client.exited;
await shutdown();
process.exit(exitCode);

export {};
