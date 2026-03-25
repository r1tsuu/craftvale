import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BUILTIN_LOCAL_SERVER_ADDRESS,
  BUILTIN_LOCAL_SERVER_ID,
  BUILTIN_LOCAL_SERVER_NAME,
  JsonSavedServerStorage,
  createSavedServerRecord,
} from "../apps/client/src/client/saved-servers.ts";

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

test("saved server storage always includes the built-in localhost server", async () => {
  const { rootDir, storage } = await createStorage();

  try {
    let servers = await storage.loadServers();
    expect(servers).toEqual([
      expect.objectContaining({
        id: BUILTIN_LOCAL_SERVER_ID,
        name: BUILTIN_LOCAL_SERVER_NAME,
        address: BUILTIN_LOCAL_SERVER_ADDRESS,
      }),
    ]);

    servers = await storage.ensureServer("Local Server", "127.0.0.1:3210");
    expect(servers).toHaveLength(1);
    expect(servers[0]?.id).toBe(BUILTIN_LOCAL_SERVER_ID);

    servers = await storage.deleteServer(BUILTIN_LOCAL_SERVER_ID);
    expect(servers).toEqual([
      expect.objectContaining({
        id: BUILTIN_LOCAL_SERVER_ID,
        name: BUILTIN_LOCAL_SERVER_NAME,
        address: BUILTIN_LOCAL_SERVER_ADDRESS,
      }),
    ]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("saved server storage keeps the built-in localhost server alongside custom entries", async () => {
  const { rootDir, storage } = await createStorage();

  try {
    let servers = await storage.addServer("Bravo", "10.0.0.1:3210");
    expect(servers).toHaveLength(2);
    expect(servers.map((server) => server.address)).toContain(BUILTIN_LOCAL_SERVER_ADDRESS);
    expect(servers.map((server) => server.address)).toContain("10.0.0.1:3210");

    const bravo = servers.find((server) => server.address === "10.0.0.1:3210");
    expect(bravo?.name).toBe("Bravo");

    servers = await storage.deleteServer(bravo!.id);
    expect(servers).toEqual([
      expect.objectContaining({
        id: BUILTIN_LOCAL_SERVER_ID,
        name: BUILTIN_LOCAL_SERVER_NAME,
        address: BUILTIN_LOCAL_SERVER_ADDRESS,
      }),
    ]);
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
      expect.objectContaining({
        id: BUILTIN_LOCAL_SERVER_ID,
        name: BUILTIN_LOCAL_SERVER_NAME,
        address: BUILTIN_LOCAL_SERVER_ADDRESS,
      }),
    ]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
