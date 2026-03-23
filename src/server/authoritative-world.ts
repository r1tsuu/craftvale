import type {
  BlockId,
  ChunkCoord,
  InventorySnapshot,
  PlayerName,
  PlayerSnapshot,
  PlayerState,
} from "../types.ts";
import {
  type ChunkPayload,
  type WorldSummary,
} from "../shared/messages.ts";
import { Chunk } from "../world/chunk.ts";
import { isCollectibleBlock, isPlaceableBlock } from "../world/blocks.ts";
import { CHUNK_SIZE, WORLD_LAYER_CHUNKS_Y } from "../world/constants.ts";
import {
  adjustInventoryCount,
  createDefaultInventory,
  getInventoryCount,
  getSelectedInventoryBlockId,
  normalizeInventorySnapshot,
  setSelectedInventorySlot,
} from "../world/inventory.ts";
import { createGeneratedChunk, getTerrainHeight } from "../world/terrain.ts";
import { worldToChunkCoord } from "../world/world.ts";
import type { WorldStorage } from "./world-storage.ts";

interface ServerChunkEntry {
  chunk: Chunk;
  hasOverride: boolean;
  saveDirty: boolean;
}

interface ServerPlayerEntry {
  snapshot: PlayerSnapshot;
  inventory: InventorySnapshot;
  saveDirty: boolean;
  persisted: boolean;
}

interface BlockMutationResult {
  changedChunks: ChunkPayload[];
  inventory: InventorySnapshot;
  inventoryChanged: boolean;
}

const DEFAULT_PLAYER_YAW = -Math.PI / 2;
const DEFAULT_PLAYER_PITCH = -0.25;

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

const playerStatesEqual = (left: PlayerState, right: PlayerState): boolean =>
  left.position[0] === right.position[0] &&
  left.position[1] === right.position[1] &&
  left.position[2] === right.position[2] &&
  left.yaw === right.yaw &&
  left.pitch === right.pitch;

export class AuthoritativeWorld {
  private readonly chunks = new Map<string, ServerChunkEntry>();
  private readonly players = new Map<PlayerName, ServerPlayerEntry>();

  public constructor(
    private world: WorldSummary,
    private readonly storage: WorldStorage,
  ) {}

  public get summary(): WorldSummary {
    return this.world;
  }

  public get spawnPosition(): [number, number, number] {
    const spawnX = 8;
    const spawnZ = 8;
    return [spawnX + 0.5, getTerrainHeight(this.world.seed, spawnX, spawnZ) + 1, spawnZ + 0.5];
  }

  public async joinPlayer(playerName: PlayerName): Promise<{
    clientPlayer: PlayerSnapshot;
    players: PlayerSnapshot[];
    inventory: InventorySnapshot;
  }> {
    const entry = await this.ensurePlayerLoaded(playerName);
    entry.snapshot = {
      ...entry.snapshot,
      active: true,
    };
    this.players.set(playerName, entry);
    return {
      clientPlayer: this.clonePlayerSnapshot(entry.snapshot),
      players: this.getActivePlayerSnapshots(playerName),
      inventory: this.cloneInventory(entry.inventory),
    };
  }

  public async leavePlayer(playerName: PlayerName): Promise<PlayerSnapshot | null> {
    const entry = this.players.get(playerName);
    if (!entry) {
      return null;
    }

    if (!entry.snapshot.active) {
      return this.clonePlayerSnapshot(entry.snapshot);
    }

    entry.snapshot = {
      ...entry.snapshot,
      active: false,
    };
    this.players.set(playerName, entry);
    return this.clonePlayerSnapshot(entry.snapshot);
  }

  public async updatePlayerState(playerName: PlayerName, state: PlayerState): Promise<PlayerSnapshot> {
    const entry = await this.ensurePlayerLoaded(playerName);
    const nextState = this.clonePlayerState(state);
    if (!playerStatesEqual(entry.snapshot.state, nextState)) {
      entry.snapshot = {
        ...entry.snapshot,
        active: true,
        state: nextState,
      };
      entry.saveDirty = true;
      this.players.set(playerName, entry);
    }

    return this.clonePlayerSnapshot(entry.snapshot);
  }

  public async getChunkPayload(coord: ChunkCoord): Promise<ChunkPayload> {
    return this.toChunkPayload((await this.ensureChunkLoaded(coord)).chunk);
  }

  public async getInventorySnapshot(playerName: PlayerName): Promise<InventorySnapshot> {
    return this.cloneInventory((await this.ensurePlayerLoaded(playerName)).inventory);
  }

  public async selectInventorySlot(playerName: PlayerName, slot: number): Promise<InventorySnapshot> {
    const entry = await this.ensurePlayerLoaded(playerName);
    const next = setSelectedInventorySlot(entry.inventory, slot);
    if (next.selectedSlot !== entry.inventory.selectedSlot) {
      entry.inventory = next;
      entry.saveDirty = true;
      this.players.set(playerName, entry);
      return this.cloneInventory(next);
    }

    return this.cloneInventory(entry.inventory);
  }

  public async applyBlockMutation(
    playerName: PlayerName,
    worldX: number,
    worldY: number,
    worldZ: number,
    blockId: BlockId,
  ): Promise<BlockMutationResult> {
    const playerEntry = await this.ensurePlayerLoaded(playerName);
    const coords = worldToChunkCoord(worldX, worldY, worldZ);
    if (!WORLD_LAYER_CHUNKS_Y.includes(coords.chunk.y)) {
      return {
        changedChunks: [],
        inventory: this.cloneInventory(playerEntry.inventory),
        inventoryChanged: false,
      };
    }

    const entry = await this.ensureChunkLoaded(coords.chunk);
    const current = entry.chunk.get(coords.local.x, coords.local.y, coords.local.z);
    let nextInventory = playerEntry.inventory;
    let inventoryChanged = false;

    if (blockId === 0) {
      if (current === 0) {
        return {
          changedChunks: [],
          inventory: this.cloneInventory(nextInventory),
          inventoryChanged: false,
        };
      }
      if (isCollectibleBlock(current)) {
        nextInventory = adjustInventoryCount(nextInventory, current, 1);
        inventoryChanged = true;
      }
    } else {
      if (current !== 0 || !isPlaceableBlock(blockId)) {
        return {
          changedChunks: [],
          inventory: this.cloneInventory(nextInventory),
          inventoryChanged: false,
        };
      }

      if (getSelectedInventoryBlockId(nextInventory) !== blockId) {
        return {
          changedChunks: [],
          inventory: this.cloneInventory(nextInventory),
          inventoryChanged: false,
        };
      }

      if (getInventoryCount(nextInventory, blockId) <= 0) {
        return {
          changedChunks: [],
          inventory: this.cloneInventory(nextInventory),
          inventoryChanged: false,
        };
      }

      nextInventory = adjustInventoryCount(nextInventory, blockId, -1);
      inventoryChanged = true;
    }

    entry.chunk.set(coords.local.x, coords.local.y, coords.local.z, blockId);
    entry.chunk.revision += 1;
    entry.hasOverride = true;
    entry.saveDirty = true;

    const affected = new Set<string>([chunkKey(coords.chunk)]);
    const maybeAffect = (chunk: ChunkCoord): void => {
      if (WORLD_LAYER_CHUNKS_Y.includes(chunk.y) && this.chunks.has(chunkKey(chunk))) {
        affected.add(chunkKey(chunk));
      }
    };

    if (coords.local.x === 0) maybeAffect({ x: coords.chunk.x - 1, y: coords.chunk.y, z: coords.chunk.z });
    if (coords.local.x === CHUNK_SIZE - 1) {
      maybeAffect({ x: coords.chunk.x + 1, y: coords.chunk.y, z: coords.chunk.z });
    }
    if (coords.local.y === 0) maybeAffect({ x: coords.chunk.x, y: coords.chunk.y - 1, z: coords.chunk.z });
    if (coords.local.y === CHUNK_SIZE - 1) {
      maybeAffect({ x: coords.chunk.x, y: coords.chunk.y + 1, z: coords.chunk.z });
    }
    if (coords.local.z === 0) maybeAffect({ x: coords.chunk.x, y: coords.chunk.y, z: coords.chunk.z - 1 });
    if (coords.local.z === CHUNK_SIZE - 1) {
      maybeAffect({ x: coords.chunk.x, y: coords.chunk.y, z: coords.chunk.z + 1 });
    }

    if (inventoryChanged) {
      playerEntry.inventory = nextInventory;
      playerEntry.saveDirty = true;
      this.players.set(playerName, playerEntry);
    }

    return {
      changedChunks: [...affected].map((key) => this.toChunkPayload(this.chunks.get(key)!.chunk)),
      inventory: this.cloneInventory(nextInventory),
      inventoryChanged,
    };
  }

  public async save(): Promise<{ world: WorldSummary; savedChunks: number }> {
    let savedChunks = 0;

    for (const [key, entry] of this.chunks) {
      if (!entry.saveDirty) {
        continue;
      }

      const baseline = createGeneratedChunk(entry.chunk.coord, this.world.seed);
      const blocksMatchBaseline = entry.chunk.blocks.every(
        (blockId, index) => blockId === baseline.blocks[index],
      );

      if (blocksMatchBaseline) {
        if (entry.hasOverride) {
          await this.storage.deleteChunk(this.world.name, entry.chunk.coord);
          savedChunks += 1;
        }
        entry.hasOverride = false;
      } else {
        await this.storage.saveChunk(this.world.name, {
          coord: entry.chunk.coord,
          blocks: entry.chunk.cloneBlocks(),
          revision: entry.chunk.revision,
        });
        entry.hasOverride = true;
        savedChunks += 1;
      }

      entry.saveDirty = false;
      this.chunks.set(key, entry);
    }

    for (const [playerName, entry] of this.players) {
      if (!entry.saveDirty) {
        continue;
      }

      await this.storage.savePlayer(this.world.name, {
        snapshot: this.clonePlayerSnapshot(entry.snapshot),
        inventory: this.cloneInventory(entry.inventory),
      });
      entry.saveDirty = false;
      entry.persisted = true;
      this.players.set(playerName, entry);
    }

    this.world = await this.storage.touchWorld(this.world.name, Date.now());
    return {
      world: this.world,
      savedChunks,
    };
  }

  private async ensureChunkLoaded(coord: ChunkCoord): Promise<ServerChunkEntry> {
    const key = chunkKey(coord);
    const existing = this.chunks.get(key);
    if (existing) {
      return existing;
    }

    const persisted = await this.storage.loadChunk(this.world.name, coord);
    const chunk = persisted ? new Chunk(coord) : createGeneratedChunk(coord, this.world.seed);

    if (persisted) {
      chunk.replace(persisted.blocks, persisted.revision);
      chunk.dirty = false;
    }

    const entry: ServerChunkEntry = {
      chunk,
      hasOverride: Boolean(persisted),
      saveDirty: false,
    };
    this.chunks.set(key, entry);
    return entry;
  }

  private async ensurePlayerLoaded(playerName: PlayerName): Promise<ServerPlayerEntry> {
    const existing = this.players.get(playerName);
    if (existing) {
      return existing;
    }

    const persisted = await this.storage.loadPlayer(this.world.name, playerName);
    const entry: ServerPlayerEntry = persisted
      ? {
        snapshot: {
          ...persisted.snapshot,
          active: false,
        },
        inventory: normalizeInventorySnapshot(persisted.inventory),
        saveDirty: false,
        persisted: true,
      }
      : {
        snapshot: this.createInitialPlayerSnapshot(playerName),
        inventory: createDefaultInventory(),
        saveDirty: true,
        persisted: false,
      };

    this.players.set(playerName, entry);
    return entry;
  }

  private createInitialPlayerSnapshot(playerName: PlayerName): PlayerSnapshot {
    return {
      name: playerName,
      active: false,
      state: {
        position: [...this.spawnPosition],
        yaw: DEFAULT_PLAYER_YAW,
        pitch: DEFAULT_PLAYER_PITCH,
      },
    };
  }

  private getActivePlayerSnapshots(excludePlayerName?: PlayerName): PlayerSnapshot[] {
    return [...this.players.values()]
      .map((entry) => entry.snapshot)
      .filter((snapshot) => snapshot.active && snapshot.name !== excludePlayerName)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((snapshot) => this.clonePlayerSnapshot(snapshot));
  }

  private toChunkPayload(chunk: Chunk): ChunkPayload {
    return {
      coord: chunk.coord,
      blocks: chunk.cloneBlocks(),
      revision: chunk.revision,
    };
  }

  private cloneInventory(inventory: InventorySnapshot): InventorySnapshot {
    return normalizeInventorySnapshot(inventory);
  }

  private clonePlayerSnapshot(snapshot: PlayerSnapshot): PlayerSnapshot {
    return {
      name: snapshot.name,
      active: snapshot.active,
      state: this.clonePlayerState(snapshot.state),
    };
  }

  private clonePlayerState(state: PlayerState): PlayerState {
    return {
      position: [...state.position],
      yaw: state.yaw,
      pitch: state.pitch,
    };
  }
}
