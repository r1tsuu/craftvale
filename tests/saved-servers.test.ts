import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  JsonSavedServerStorage,
  createSavedServerRecord,
} from "../src/client/saved-servers.ts";

const createStorage = async (): Promise<{
  rootDir: string;
  storage: JsonSavedServerStorage;
}> => {
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-saved-servers-"));
  return {
    rootDir,
    storage: new JsonSavedServerStorage(rootDir),
  };
};

test("saved server storage adds, reuses, and deletes local server entries", async () => {
  const { rootDir, storage } = await createStorage();

  try {
    let servers = await storage.addServer("Local Server", "127.0.0.1:3210");
    expect(servers).toHaveLength(1);
    expect(servers[0]?.name).toBe("Local Server");

    servers = await storage.ensureServer("Local Server", "127.0.0.1:3210");
    expect(servers).toHaveLength(1);

    servers = await storage.deleteServer(servers[0]!.id);
    expect(servers).toEqual([]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("saved server storage normalizes valid persisted entries", async () => {
  const { rootDir, storage } = await createStorage();

  try {
    await writeFile(
      join(rootDir, "saved-servers.json"),
      `${JSON.stringify({
        version: 1,
        servers: [
          createSavedServerRecord("  Bravo  ", "  10.0.0.1:3210  ", 1),
          { id: "bad", name: "", address: "", createdAt: 0, updatedAt: 0 },
        ],
      }, null, 2)}\n`,
      "utf8",
    );

    expect(await storage.loadServers()).toEqual([
      expect.objectContaining({
        name: "Bravo",
        address: "10.0.0.1:3210",
      }),
    ]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
