import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SavedServerRecord } from "@voxel/core/shared";
import { DEFAULT_CLIENT_STORAGE_ROOT } from "./player-profile.ts";

const SAVED_SERVERS_VERSION = 1;
const SAVED_SERVERS_FILENAME = "saved-servers.json";
export const BUILTIN_LOCAL_SERVER_ID = "builtin-local-server";
export const BUILTIN_LOCAL_SERVER_NAME = "Local Server";
export const BUILTIN_LOCAL_SERVER_ADDRESS = "127.0.0.1:3210";

interface PersistedSavedServers {
  version: 1;
  servers: SavedServerRecord[];
}

const toSavedServersPath = (storageRoot: string): string =>
  join(storageRoot, SAVED_SERVERS_FILENAME);

const normalizeName = (value: string): string =>
  value.trim().replace(/\s+/g, " ").slice(0, 32);

const normalizeAddress = (value: string): string =>
  value.trim().replace(/\s+/g, "").slice(0, 128);

const isValidSavedServer = (value: unknown): value is SavedServerRecord =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { id?: unknown }).id === "string" &&
  typeof (value as { name?: unknown }).name === "string" &&
  typeof (value as { address?: unknown }).address === "string" &&
  typeof (value as { createdAt?: unknown }).createdAt === "number" &&
  typeof (value as { updatedAt?: unknown }).updatedAt === "number";

const normalizeSavedServer = (server: SavedServerRecord): SavedServerRecord => ({
  id: server.id,
  name: normalizeName(server.name),
  address: normalizeAddress(server.address),
  createdAt: server.createdAt,
  updatedAt: server.updatedAt,
});

const sortServers = (servers: readonly SavedServerRecord[]): SavedServerRecord[] =>
  [...servers]
    .map(normalizeSavedServer)
    .filter((server) => Boolean(server.id && server.name && server.address))
    .sort((left, right) => left.name.localeCompare(right.name));

const createBuiltinLocalServerRecord = (): SavedServerRecord => ({
  id: BUILTIN_LOCAL_SERVER_ID,
  name: BUILTIN_LOCAL_SERVER_NAME,
  address: BUILTIN_LOCAL_SERVER_ADDRESS,
  createdAt: 0,
  updatedAt: 0,
});

const mergeBuiltinServers = (servers: readonly SavedServerRecord[]): SavedServerRecord[] => {
  const normalized = sortServers(servers);
  if (normalized.some((server) => server.address === BUILTIN_LOCAL_SERVER_ADDRESS)) {
    return normalized;
  }

  return sortServers([...normalized, createBuiltinLocalServerRecord()]);
};

export const createSavedServerRecord = (
  name: string,
  address: string,
  now = Date.now(),
): SavedServerRecord => ({
  id: crypto.randomUUID(),
  name: normalizeName(name),
  address: normalizeAddress(address),
  createdAt: now,
  updatedAt: now,
});

export const isValidSavedServerName = (value: string): boolean =>
  normalizeName(value).length > 0;

export const isValidSavedServerAddress = (value: string): boolean =>
  normalizeAddress(value).length > 0;

export class JsonSavedServerStorage {
  public constructor(private readonly storageRoot = DEFAULT_CLIENT_STORAGE_ROOT) {}

  private async loadPersistedServers(): Promise<SavedServerRecord[]> {
    try {
      const text = await readFile(toSavedServersPath(this.storageRoot), "utf8");
      const parsed = JSON.parse(text) as Partial<PersistedSavedServers>;
      if (parsed.version !== SAVED_SERVERS_VERSION || !Array.isArray(parsed.servers)) {
        throw new Error("Saved servers file is invalid.");
      }

      return sortServers(parsed.servers.filter(isValidSavedServer));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  public async loadServers(): Promise<SavedServerRecord[]> {
    return mergeBuiltinServers(await this.loadPersistedServers());
  }

  public async saveServers(servers: readonly SavedServerRecord[]): Promise<void> {
    await mkdir(this.storageRoot, { recursive: true });
    const persisted: PersistedSavedServers = {
      version: SAVED_SERVERS_VERSION,
      servers: sortServers(
        servers.filter((server) => server.id !== BUILTIN_LOCAL_SERVER_ID),
      ),
    };
    await writeFile(
      toSavedServersPath(this.storageRoot),
      `${JSON.stringify(persisted, null, 2)}\n`,
      "utf8",
    );
  }

  public async addServer(name: string, address: string): Promise<SavedServerRecord[]> {
    const servers = await this.loadPersistedServers();
    const next = [...servers, createSavedServerRecord(name, address)];
    await this.saveServers(next);
    return this.loadServers();
  }

  public async deleteServer(serverId: string): Promise<SavedServerRecord[]> {
    const servers = await this.loadPersistedServers();
    const next = servers.filter((server) => server.id !== serverId);
    await this.saveServers(next);
    return this.loadServers();
  }

  public async ensureServer(name: string, address: string): Promise<SavedServerRecord[]> {
    const normalizedName = normalizeName(name);
    const normalizedAddress = normalizeAddress(address);
    if (normalizedAddress === BUILTIN_LOCAL_SERVER_ADDRESS) {
      return this.loadServers();
    }

    const servers = await this.loadPersistedServers();
    const existing = servers.find((server) => server.address === normalizedAddress);
    if (existing) {
      const next = servers.map((server) =>
        server.id === existing.id
          ? {
              ...server,
              name: normalizedName,
              updatedAt: Date.now(),
            }
          : server
      );
      await this.saveServers(next);
      return this.loadServers();
    }

    return this.addServer(normalizedName, normalizedAddress);
  }
}
