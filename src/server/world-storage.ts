import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BlockId,
  ChunkCoord,
  InventorySnapshot,
  PlayerGamemode,
  PlayerName,
  PlayerSnapshot,
} from "../types.ts";
import type { WorldSummary } from "../shared/messages.ts";
import { normalizeInventorySnapshot } from "../world/inventory.ts";

const REGISTRY_MAGIC = "VWRG";
const CHUNK_MAGIC = "VCHK";
const PLAYER_MAGIC = "VPLY";
const REGISTRY_VERSION = 1;
const CHUNK_VERSION = 1;
const PLAYER_VERSION = 2;

export interface StoredWorldRecord extends WorldSummary {
  directoryName: string;
}

export interface StoredChunkRecord {
  coord: ChunkCoord;
  blocks: Uint8Array;
  revision: number;
}

export interface StoredPlayerRecord {
  snapshot: PlayerSnapshot;
  inventory: InventorySnapshot;
}

export interface WorldStorage {
  listWorlds(): Promise<WorldSummary[]>;
  getWorld(name: string): Promise<StoredWorldRecord | null>;
  createWorld(name: string, seed: number): Promise<StoredWorldRecord>;
  deleteWorld(name: string): Promise<boolean>;
  loadChunk(worldName: string, coord: ChunkCoord): Promise<StoredChunkRecord | null>;
  saveChunk(worldName: string, chunk: StoredChunkRecord): Promise<void>;
  deleteChunk(worldName: string, coord: ChunkCoord): Promise<void>;
  loadPlayer(worldName: string, playerName: PlayerName): Promise<StoredPlayerRecord | null>;
  savePlayer(worldName: string, player: StoredPlayerRecord): Promise<void>;
  touchWorld(worldName: string, updatedAt?: number): Promise<StoredWorldRecord>;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const chunkFilename = (coord: ChunkCoord): string => `${coord.x}_${coord.y}_${coord.z}.bin`;
const playerFilename = (playerName: PlayerName): string => `${encodeURIComponent(playerName)}.bin`;

const writeString = (target: Uint8Array, offset: number, value: string): number => {
  const bytes = textEncoder.encode(value);
  const view = new DataView(target.buffer, target.byteOffset, target.byteLength);
  view.setUint16(offset, bytes.length, true);
  target.set(bytes, offset + 2);
  return offset + 2 + bytes.length;
};

const readString = (source: Uint8Array, offset: number): { value: string; nextOffset: number } => {
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const length = view.getUint16(offset, true);
  const start = offset + 2;
  const end = start + length;
  return {
    value: textDecoder.decode(source.subarray(start, end)),
    nextOffset: end,
  };
};

const encodeRegistry = (worlds: readonly StoredWorldRecord[]): Uint8Array => {
  const strings = worlds.map((world) => ({
    name: textEncoder.encode(world.name),
    directoryName: textEncoder.encode(world.directoryName),
  }));
  const totalSize =
    12 +
    strings.reduce(
      (size, value) => size + 2 + value.name.length + 2 + value.directoryName.length + 4 + 8 + 8,
      0,
    );
  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);
  bytes.set(textEncoder.encode(REGISTRY_MAGIC), 0);
  view.setUint32(4, REGISTRY_VERSION, true);
  view.setUint32(8, worlds.length, true);

  let offset = 12;
  for (let index = 0; index < worlds.length; index += 1) {
    const world = worlds[index];
    offset = writeString(bytes, offset, world.name);
    offset = writeString(bytes, offset, world.directoryName);
    view.setUint32(offset, world.seed >>> 0, true);
    offset += 4;
    view.setFloat64(offset, world.createdAt, true);
    offset += 8;
    view.setFloat64(offset, world.updatedAt, true);
    offset += 8;
  }

  return bytes;
};

const decodeRegistry = (bytes: Uint8Array): StoredWorldRecord[] => {
  if (bytes.byteLength < 12) {
    throw new Error("World registry is truncated.");
  }

  const magic = textDecoder.decode(bytes.subarray(0, 4));
  if (magic !== REGISTRY_MAGIC) {
    throw new Error(`Invalid world registry header: ${magic}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version !== REGISTRY_VERSION) {
    throw new Error(`Unsupported world registry version ${version}.`);
  }

  const count = view.getUint32(8, true);
  const worlds: StoredWorldRecord[] = [];
  let offset = 12;

  for (let index = 0; index < count; index += 1) {
    const name = readString(bytes, offset);
    const directoryName = readString(bytes, name.nextOffset);
    const seed = view.getUint32(directoryName.nextOffset, true);
    const createdAt = view.getFloat64(directoryName.nextOffset + 4, true);
    const updatedAt = view.getFloat64(directoryName.nextOffset + 12, true);
    offset = directoryName.nextOffset + 20;
    worlds.push({
      name: name.value,
      directoryName: directoryName.value,
      seed,
      createdAt,
      updatedAt,
    });
  }

  return worlds;
};

const encodeChunk = (chunk: StoredChunkRecord): Uint8Array => {
  const bytes = new Uint8Array(28 + chunk.blocks.length);
  const view = new DataView(bytes.buffer);
  bytes.set(textEncoder.encode(CHUNK_MAGIC), 0);
  view.setUint32(4, CHUNK_VERSION, true);
  view.setInt32(8, chunk.coord.x, true);
  view.setInt32(12, chunk.coord.y, true);
  view.setInt32(16, chunk.coord.z, true);
  view.setUint32(20, chunk.revision >>> 0, true);
  view.setUint32(24, chunk.blocks.length, true);
  bytes.set(chunk.blocks, 28);
  return bytes;
};

const decodeChunk = (bytes: Uint8Array): StoredChunkRecord => {
  if (bytes.byteLength < 28) {
    throw new Error("Chunk file is truncated.");
  }

  const magic = textDecoder.decode(bytes.subarray(0, 4));
  if (magic !== CHUNK_MAGIC) {
    throw new Error(`Invalid chunk file header: ${magic}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version !== CHUNK_VERSION) {
    throw new Error(`Unsupported chunk file version ${version}.`);
  }

  const length = view.getUint32(24, true);
  return {
    coord: {
      x: view.getInt32(8, true),
      y: view.getInt32(12, true),
      z: view.getInt32(16, true),
    },
    revision: view.getUint32(20, true),
    blocks: bytes.slice(28, 28 + length),
  };
};

const encodePlayer = (record: StoredPlayerRecord): Uint8Array => {
  const inventory = normalizeInventorySnapshot(record.inventory);
  const bytes = new Uint8Array(60 + inventory.slots.length * 8);
  const view = new DataView(bytes.buffer);
  bytes.set(textEncoder.encode(PLAYER_MAGIC), 0);
  view.setUint32(4, PLAYER_VERSION, true);
  view.setFloat64(8, record.snapshot.state.position[0], true);
  view.setFloat64(16, record.snapshot.state.position[1], true);
  view.setFloat64(24, record.snapshot.state.position[2], true);
  view.setFloat64(32, record.snapshot.state.yaw, true);
  view.setFloat64(40, record.snapshot.state.pitch, true);
  view.setUint32(48, record.snapshot.gamemode, true);
  view.setUint32(52, inventory.selectedSlot >>> 0, true);
  view.setUint32(56, inventory.slots.length, true);

  let offset = 60;
  for (const slot of inventory.slots) {
    view.setUint32(offset, slot.blockId >>> 0, true);
    view.setUint32(offset + 4, Math.max(0, Math.trunc(slot.count)) >>> 0, true);
    offset += 8;
  }

  return bytes;
};

const decodePlayer = (bytes: Uint8Array, playerName: PlayerName): StoredPlayerRecord => {
  if (bytes.byteLength < 56) {
    throw new Error("Player file is truncated.");
  }

  const magic = textDecoder.decode(bytes.subarray(0, 4));
  if (magic !== PLAYER_MAGIC) {
    throw new Error(`Invalid player file header: ${magic}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version !== 1 && version !== PLAYER_VERSION) {
    throw new Error(`Unsupported player file version ${version}.`);
  }

  const gamemode: PlayerGamemode = version >= 2 ? (view.getUint32(48, true) === 1 ? 1 : 0) : 0;
  const selectedSlot = version >= 2 ? view.getUint32(52, true) : view.getUint32(48, true);
  const slotCount = version >= 2 ? view.getUint32(56, true) : view.getUint32(52, true);
  const slots: InventorySnapshot["slots"] = [];
  let offset = version >= 2 ? 60 : 56;
  for (let index = 0; index < slotCount; index += 1) {
    slots.push({
      blockId: view.getUint32(offset, true) as BlockId,
      count: view.getUint32(offset + 4, true),
    });
    offset += 8;
  }

  return {
    snapshot: {
      name: playerName,
      active: false,
      gamemode,
      flying: false,
      state: {
        position: [
          view.getFloat64(8, true),
          view.getFloat64(16, true),
          view.getFloat64(24, true),
        ],
        yaw: view.getFloat64(32, true),
        pitch: view.getFloat64(40, true),
      },
    },
    inventory: normalizeInventorySnapshot({
      slots,
      selectedSlot,
    }),
  };
};

const sanitizeDirectoryToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "world";

export class BinaryWorldStorage implements WorldStorage {
  private readonly registryPath: string;
  private readonly worldsRoot: string;
  private operationChain: Promise<void> = Promise.resolve();

  public constructor(private readonly rootDir: string) {
    this.registryPath = join(rootDir, "registry.bin");
    this.worldsRoot = join(rootDir, "worlds");
  }

  public async listWorlds(): Promise<WorldSummary[]> {
    return this.enqueue(async () => {
      const registry = await this.readRegistry();
      return registry
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(({ directoryName: _directoryName, ...world }) => world);
    });
  }

  public async getWorld(name: string): Promise<StoredWorldRecord | null> {
    return this.enqueue(async () => {
      const registry = await this.readRegistry();
      return registry.find((world) => world.name === name) ?? null;
    });
  }

  public async createWorld(name: string, seed: number): Promise<StoredWorldRecord> {
    return this.enqueue(async () => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("World name is required.");
      }

      const registry = await this.readRegistry();
      if (registry.some((world) => world.name === trimmedName)) {
        throw new Error(`World "${trimmedName}" already exists.`);
      }

      const now = Date.now();
      const directoryName = `${sanitizeDirectoryToken(trimmedName)}-${now.toString(36)}`;
      const record: StoredWorldRecord = {
        name: trimmedName,
        directoryName,
        seed: seed >>> 0,
        createdAt: now,
        updatedAt: now,
      };

      registry.push(record);
      await this.ensureDirectories(record.directoryName);
      await this.writeRegistry(registry);
      return record;
    });
  }

  public async deleteWorld(name: string): Promise<boolean> {
    return this.enqueue(async () => {
      const registry = await this.readRegistry();
      const world = registry.find((candidate) => candidate.name === name);
      if (!world) {
        return false;
      }

      await rm(this.worldDirectory(world.directoryName), { recursive: true, force: true });
      await this.writeRegistry(registry.filter((candidate) => candidate.name !== name));
      return true;
    });
  }

  public async loadChunk(worldName: string, coord: ChunkCoord): Promise<StoredChunkRecord | null> {
    return this.enqueue(async () => {
      const world = await this.getWorldFromRegistry(worldName);
      if (!world) {
        return null;
      }

      const path = this.chunkPath(world.directoryName, coord);

      try {
        const bytes = new Uint8Array(await readFile(path));
        return decodeChunk(bytes);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    });
  }

  public async saveChunk(worldName: string, chunk: StoredChunkRecord): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.requireWorld(worldName);
      await this.ensureDirectories(world.directoryName);
      await writeFile(this.chunkPath(world.directoryName, chunk.coord), encodeChunk(chunk));
    });
  }

  public async deleteChunk(worldName: string, coord: ChunkCoord): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.getWorldFromRegistry(worldName);
      if (!world) {
        return;
      }
      await rm(this.chunkPath(world.directoryName, coord), { force: true });
    });
  }

  public async loadPlayer(worldName: string, playerName: PlayerName): Promise<StoredPlayerRecord | null> {
    return this.enqueue(async () => {
      const world = await this.getWorldFromRegistry(worldName);
      if (!world) {
        return null;
      }

      try {
        const bytes = new Uint8Array(await readFile(this.playerPath(world.directoryName, playerName)));
        return decodePlayer(bytes, playerName);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    });
  }

  public async savePlayer(worldName: string, player: StoredPlayerRecord): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.requireWorld(worldName);
      await this.ensureDirectories(world.directoryName);
      await writeFile(
        this.playerPath(world.directoryName, player.snapshot.name),
        encodePlayer(player),
      );
    });
  }

  public async touchWorld(worldName: string, updatedAt = Date.now()): Promise<StoredWorldRecord> {
    return this.enqueue(async () => {
      const registry = await this.readRegistry();
      const world = registry.find((candidate) => candidate.name === worldName);
      if (!world) {
        throw new Error(`Unknown world "${worldName}".`);
      }

      world.updatedAt = updatedAt;
      await this.writeRegistry(registry);
      return world;
    });
  }

  private async requireWorld(name: string): Promise<StoredWorldRecord> {
    const world = await this.getWorldFromRegistry(name);
    if (!world) {
      throw new Error(`Unknown world "${name}".`);
    }
    return world;
  }

  private async getWorldFromRegistry(name: string): Promise<StoredWorldRecord | null> {
    const registry = await this.readRegistry();
    return registry.find((world) => world.name === name) ?? null;
  }

  private async ensureDirectories(directoryName?: string): Promise<void> {
    await mkdir(this.worldsRoot, { recursive: true });
    if (directoryName) {
      await mkdir(this.worldDirectory(directoryName), { recursive: true });
      await mkdir(this.playerDirectory(directoryName), { recursive: true });
    }
  }

  private async readRegistry(): Promise<StoredWorldRecord[]> {
    await this.ensureDirectories();

    try {
      const bytes = new Uint8Array(await readFile(this.registryPath));
      return decodeRegistry(bytes);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async writeRegistry(worlds: readonly StoredWorldRecord[]): Promise<void> {
    await this.ensureDirectories();
    await writeFile(this.registryPath, encodeRegistry(worlds));
  }

  private worldDirectory(directoryName: string): string {
    return join(this.worldsRoot, directoryName);
  }

  private chunkPath(directoryName: string, coord: ChunkCoord): string {
    return join(this.worldDirectory(directoryName), chunkFilename(coord));
  }

  private playerDirectory(directoryName: string): string {
    return join(this.worldDirectory(directoryName), "players");
  }

  private playerPath(directoryName: string, playerName: PlayerName): string {
    return join(this.playerDirectory(directoryName), playerFilename(playerName));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationChain.then(operation, operation);
    this.operationChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
