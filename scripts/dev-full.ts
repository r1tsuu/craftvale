const SERVER_PORT = 3210;
const SERVER_NAME = "Local Server";
const SERVER_ADDRESS = `127.0.0.1:${SERVER_PORT}`;
const SERVER_SHUTDOWN_TIMEOUT_MS = 3_000;

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

await Bun.sleep(400);

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
