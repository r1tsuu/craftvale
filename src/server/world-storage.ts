import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BlockId,
  ChunkCoord,
  DroppedItemSnapshot,
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
const DROPPED_ITEMS_MAGIC = "VDRP";
const REGISTRY_VERSION = 1;
const CHUNK_VERSION = 1;
const PLAYER_VERSION = 4;
const DROPPED_ITEMS_VERSION = 1;

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

export interface StoredDroppedItemRecord {
  snapshot: DroppedItemSnapshot;
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
  loadDroppedItems(worldName: string): Promise<DroppedItemSnapshot[]>;
  saveDroppedItems(worldName: string, items: readonly DroppedItemSnapshot[]): Promise<void>;
  touchWorld(worldName: string, updatedAt?: number): Promise<StoredWorldRecord>;
}

export const DEDICATED_WORLD_DIRECTORY_NAME = "world";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const chunkFilename = (coord: ChunkCoord): string => `${coord.x}_${coord.y}_${coord.z}.bin`;
const playerFilename = (playerName: PlayerName): string => `${encodeURIComponent(playerName)}.bin`;
const droppedItemsFilename = (): string => "dropped-items.bin";

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
  const entityIdBytes = textEncoder.encode(record.snapshot.entityId);
  const bytes = new Uint8Array(
    72 + (inventory.hotbar.length + inventory.main.length) * 8 + 2 + entityIdBytes.length,
  );
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
  view.setUint32(56, inventory.hotbar.length, true);
  view.setUint32(60, inventory.main.length, true);
  view.setUint32(64, inventory.cursor?.blockId ?? 0, true);
  view.setUint32(68, inventory.cursor?.count ?? 0, true);

  let offset = 72;
  for (const slot of [...inventory.hotbar, ...inventory.main]) {
    view.setUint32(offset, slot.blockId >>> 0, true);
    view.setUint32(offset + 4, Math.max(0, Math.trunc(slot.count)) >>> 0, true);
    offset += 8;
  }

  writeString(bytes, offset, record.snapshot.entityId);

  return bytes;
};

const decodePlayer = (bytes: Uint8Array, playerName: PlayerName): StoredPlayerRecord => {
  if (bytes.byteLength < 72) {
    throw new Error("Player file is truncated.");
  }

  const magic = textDecoder.decode(bytes.subarray(0, 4));
  if (magic !== PLAYER_MAGIC) {
    throw new Error(`Invalid player file header: ${magic}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version !== PLAYER_VERSION) {
    throw new Error(`Unsupported player file version ${version}.`);
  }

  const gamemode: PlayerGamemode = view.getUint32(48, true) === 1 ? 1 : 0;
  const selectedSlot = view.getUint32(52, true);
  const hotbarCount = view.getUint32(56, true);
  const mainCount = view.getUint32(60, true);
  const cursorBlockId = view.getUint32(64, true) as BlockId;
  const cursorCount = view.getUint32(68, true);
  const hotbar: InventorySnapshot["hotbar"] = [];
  const main: InventorySnapshot["main"] = [];
  let offset = 72;

  for (let index = 0; index < hotbarCount; index += 1) {
    hotbar.push({
      blockId: view.getUint32(offset, true) as BlockId,
      count: view.getUint32(offset + 4, true),
    });
    offset += 8;
  }

  for (let index = 0; index < mainCount; index += 1) {
    main.push({
      blockId: view.getUint32(offset, true) as BlockId,
      count: view.getUint32(offset + 4, true),
    });
    offset += 8;
  }

  const entityId = readString(bytes, offset).value;

  const inventory = normalizeInventorySnapshot({
    hotbar,
    main,
    selectedSlot,
    cursor: cursorCount > 0
      ? {
          blockId: cursorBlockId,
          count: cursorCount,
        }
      : null,
  });

  return {
    snapshot: {
      entityId,
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
    inventory,
  };
};

const encodeDroppedItems = (items: readonly DroppedItemSnapshot[]): Uint8Array => {
  const entityIds = items.map((item) => textEncoder.encode(item.entityId));
  const totalSize = 12 + items.reduce((size, _item, index) => size + 66 + entityIds[index]!.length, 0);
  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);
  bytes.set(textEncoder.encode(DROPPED_ITEMS_MAGIC), 0);
  view.setUint32(4, DROPPED_ITEMS_VERSION, true);
  view.setUint32(8, items.length, true);

  let offset = 12;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    view.setFloat64(offset, item.position[0], true);
    view.setFloat64(offset + 8, item.position[1], true);
    view.setFloat64(offset + 16, item.position[2], true);
    view.setFloat64(offset + 24, item.velocity[0], true);
    view.setFloat64(offset + 32, item.velocity[1], true);
    view.setFloat64(offset + 40, item.velocity[2], true);
    view.setUint32(offset + 48, item.blockId >>> 0, true);
    view.setUint32(offset + 52, Math.max(0, Math.trunc(item.count)) >>> 0, true);
    offset += 56;
    offset = writeString(bytes, offset, item.entityId);
    view.setFloat64(offset, Math.max(0, item.pickupCooldownMs), true);
    offset += 8;
  }

  return bytes;
};

const decodeDroppedItems = (bytes: Uint8Array): DroppedItemSnapshot[] => {
  if (bytes.byteLength < 12) {
    throw new Error("Dropped items file is truncated.");
  }

  const magic = textDecoder.decode(bytes.subarray(0, 4));
  if (magic !== DROPPED_ITEMS_MAGIC) {
    throw new Error(`Invalid dropped items file header: ${magic}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version !== DROPPED_ITEMS_VERSION) {
    throw new Error(`Unsupported dropped items file version ${version}.`);
  }

  const count = view.getUint32(8, true);
  const items: DroppedItemSnapshot[] = [];
  let offset = 12;

  for (let index = 0; index < count; index += 1) {
    const position: [number, number, number] = [
      view.getFloat64(offset, true),
      view.getFloat64(offset + 8, true),
      view.getFloat64(offset + 16, true),
    ];
    const velocity: [number, number, number] = [
      view.getFloat64(offset + 24, true),
      view.getFloat64(offset + 32, true),
      view.getFloat64(offset + 40, true),
    ];
    const blockId = view.getUint32(offset + 48, true) as BlockId;
    const countValue = view.getUint32(offset + 52, true);
    offset += 56;
    const entityId = readString(bytes, offset);
    offset = entityId.nextOffset;
    const pickupCooldownMs = view.getFloat64(offset, true);
    offset += 8;
    items.push({
      entityId: entityId.value,
      position,
      velocity,
      blockId,
      count: countValue,
      pickupCooldownMs,
    });
  }

  return items;
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

  public async loadDroppedItems(worldName: string): Promise<DroppedItemSnapshot[]> {
    return this.enqueue(async () => {
      const world = await this.getWorldFromRegistry(worldName);
      if (!world) {
        return [];
      }

      try {
        const bytes = new Uint8Array(await readFile(this.droppedItemsPath(world.directoryName)));
        return decodeDroppedItems(bytes);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return [];
        }
        throw error;
      }
    });
  }

  public async saveDroppedItems(
    worldName: string,
    items: readonly DroppedItemSnapshot[],
  ): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.requireWorld(worldName);
      await this.ensureDirectories(world.directoryName);
      const path = this.droppedItemsPath(world.directoryName);

      if (items.length === 0) {
        await rm(path, { force: true });
        return;
      }

      await writeFile(path, encodeDroppedItems(items));
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

  private droppedItemsPath(directoryName: string): string {
    return join(this.worldDirectory(directoryName), droppedItemsFilename());
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

export class DedicatedWorldStorage implements WorldStorage {
  private readonly worldRoot: string;
  private readonly metadataPath: string;
  private readonly playersRoot: string;
  private operationChain: Promise<void> = Promise.resolve();
  private cachedWorld: StoredWorldRecord | null = null;

  public constructor(private readonly rootDir: string) {
    this.worldRoot = join(rootDir, DEDICATED_WORLD_DIRECTORY_NAME);
    this.metadataPath = join(this.worldRoot, "metadata.bin");
    this.playersRoot = join(this.worldRoot, "players");
  }

  public async listWorlds(): Promise<WorldSummary[]> {
    return this.enqueue(async () => {
      const world = await this.readWorldRecord();
      if (!world) {
        return [];
      }

      const { directoryName: _directoryName, ...summary } = world;
      return [summary];
    });
  }

  public async getWorld(name: string): Promise<StoredWorldRecord | null> {
    return this.enqueue(async () => {
      const world = await this.readWorldRecord();
      if (!world || world.name !== name) {
        return null;
      }

      return world;
    });
  }

  public async createWorld(name: string, seed: number): Promise<StoredWorldRecord> {
    return this.enqueue(async () => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("World name is required.");
      }

      const existing = await this.readWorldRecord();
      if (existing) {
        throw new Error(`World "${existing.name}" already exists.`);
      }

      const now = Date.now();
      const world: StoredWorldRecord = {
        name: trimmedName,
        directoryName: DEDICATED_WORLD_DIRECTORY_NAME,
        seed: seed >>> 0,
        createdAt: now,
        updatedAt: now,
      };

      await this.ensureDirectories();
      await this.writeWorldMetadata(world);
      return world;
    });
  }

  public async deleteWorld(name: string): Promise<boolean> {
    return this.enqueue(async () => {
      const world = await this.readWorldRecord();
      if (!world || world.name !== name) {
        return false;
      }

      await rm(this.worldRoot, { recursive: true, force: true });
      this.cachedWorld = null;
      return true;
    });
  }

  public async loadChunk(worldName: string, coord: ChunkCoord): Promise<StoredChunkRecord | null> {
    return this.enqueue(async () => {
      const world = await this.getStoredWorld(worldName);
      if (!world) {
        return null;
      }

      try {
        const bytes = new Uint8Array(await readFile(this.chunkPath(coord)));
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
      await this.requireWorld(worldName);
      await this.ensureDirectories();
      await writeFile(this.chunkPath(chunk.coord), encodeChunk(chunk));
    });
  }

  public async deleteChunk(worldName: string, coord: ChunkCoord): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.getStoredWorld(worldName);
      if (!world) {
        return;
      }

      await rm(this.chunkPath(coord), { force: true });
    });
  }

  public async loadPlayer(worldName: string, playerName: PlayerName): Promise<StoredPlayerRecord | null> {
    return this.enqueue(async () => {
      const world = await this.getStoredWorld(worldName);
      if (!world) {
        return null;
      }

      try {
        const bytes = new Uint8Array(await readFile(this.playerPath(playerName)));
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
      await this.requireWorld(worldName);
      await this.ensureDirectories();
      await writeFile(this.playerPath(player.snapshot.name), encodePlayer(player));
    });
  }

  public async loadDroppedItems(worldName: string): Promise<DroppedItemSnapshot[]> {
    return this.enqueue(async () => {
      const world = await this.getStoredWorld(worldName);
      if (!world) {
        return [];
      }

      try {
        const bytes = new Uint8Array(await readFile(this.droppedItemsPath()));
        return decodeDroppedItems(bytes);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return [];
        }
        throw error;
      }
    });
  }

  public async saveDroppedItems(
    worldName: string,
    items: readonly DroppedItemSnapshot[],
  ): Promise<void> {
    return this.enqueue(async () => {
      await this.requireWorld(worldName);
      await this.ensureDirectories();
      const path = this.droppedItemsPath();

      if (items.length === 0) {
        await rm(path, { force: true });
        return;
      }

      await writeFile(path, encodeDroppedItems(items));
    });
  }

  public async touchWorld(worldName: string, updatedAt = Date.now()): Promise<StoredWorldRecord> {
    return this.enqueue(async () => {
      const world = await this.requireWorld(worldName);
      const updatedWorld: StoredWorldRecord = {
        ...world,
        updatedAt,
      };
      await this.writeWorldMetadata(updatedWorld);
      return updatedWorld;
    });
  }

  private async getStoredWorld(worldName: string): Promise<StoredWorldRecord | null> {
    const world = await this.readWorldRecord();
    if (!world || world.name !== worldName) {
      return null;
    }

    return world;
  }

  private async requireWorld(worldName: string): Promise<StoredWorldRecord> {
    const world = await this.getStoredWorld(worldName);
    if (!world) {
      throw new Error(`Unknown world "${worldName}".`);
    }

    return world;
  }

  private async ensureDirectories(): Promise<void> {
    await mkdir(this.worldRoot, { recursive: true });
    await mkdir(this.playersRoot, { recursive: true });
  }

  private async readWorldRecord(): Promise<StoredWorldRecord | null> {
    const fromDisk = await this.readWorldMetadata();
    if (fromDisk) {
      this.cachedWorld = fromDisk;
      return fromDisk;
    }

    return this.cachedWorld;
  }

  private async readWorldMetadata(): Promise<StoredWorldRecord | null> {
    try {
      const bytes = new Uint8Array(await readFile(this.metadataPath));
      const [world] = decodeRegistry(bytes);
      return world ?? null;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  private async writeWorldMetadata(world: StoredWorldRecord): Promise<void> {
    await this.ensureDirectories();
    const normalizedWorld: StoredWorldRecord = {
      ...world,
      directoryName: DEDICATED_WORLD_DIRECTORY_NAME,
    };
    this.cachedWorld = normalizedWorld;
    await writeFile(this.metadataPath, encodeRegistry([normalizedWorld]));
  }

  private chunkPath(coord: ChunkCoord): string {
    return join(this.worldRoot, chunkFilename(coord));
  }

  private playerPath(playerName: PlayerName): string {
    return join(this.playersRoot, playerFilename(playerName));
  }

  private droppedItemsPath(): string {
    return join(this.worldRoot, droppedItemsFilename());
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
