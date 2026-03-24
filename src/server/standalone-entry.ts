import { DedicatedServer, DEFAULT_DEDICATED_SERVER_PORT } from "./dedicated-server.ts";
import { ensurePortAvailable } from "./port-availability.ts";

const parsePort = (argv: readonly string[]): number | undefined => {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") {
      const next = argv[index + 1];
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.trunc(parsed);
      }
    }

    if (arg.startsWith("--port=")) {
      const parsed = Number(arg.slice("--port=".length));
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.trunc(parsed);
      }
    }
  }

  return undefined;
};

const port = parsePort(Bun.argv.slice(2)) ?? DEFAULT_DEDICATED_SERVER_PORT;
console.log(`[server] starting dedicated server on port ${port}...`);
await ensurePortAvailable(port);
const server = await DedicatedServer.start({ port });

server.logInfo(
  `started on ws://127.0.0.1:${server.socketServer.port}/ws for world "${server.world.summary.name}" (seed ${server.world.summary.seed})`,
);

const shutdown = async (): Promise<void> => {
  server.logInfo("shutting down");
  await server.shutdown();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
