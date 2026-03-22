import type { BlockId, ChunkCoord, InventorySnapshot } from "../types.ts";
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

interface BlockMutationResult {
  changedChunks: ChunkPayload[];
  inventory: InventorySnapshot;
  inventoryChanged: boolean;
}

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

export class AuthoritativeWorld {
  private readonly chunks = new Map<string, ServerChunkEntry>();
  private inventory: InventorySnapshot | null = null;
  private inventoryDirty = false;

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

  public async getChunkPayload(coord: ChunkCoord): Promise<ChunkPayload> {
    return this.toChunkPayload((await this.ensureChunkLoaded(coord)).chunk);
  }

  public async getInventorySnapshot(): Promise<InventorySnapshot> {
    return this.cloneInventory(await this.ensureInventoryLoaded());
  }

  public async selectInventorySlot(slot: number): Promise<InventorySnapshot> {
    const current = await this.ensureInventoryLoaded();
    const next = setSelectedInventorySlot(current, slot);
    if (next.selectedSlot !== current.selectedSlot) {
      this.inventory = next;
      this.inventoryDirty = true;
      return this.cloneInventory(next);
    }

    return this.cloneInventory(current);
  }

  public async applyBlockMutation(
    worldX: number,
    worldY: number,
    worldZ: number,
    blockId: BlockId,
  ): Promise<BlockMutationResult> {
    const inventory = await this.ensureInventoryLoaded();
    const coords = worldToChunkCoord(worldX, worldY, worldZ);
    if (!WORLD_LAYER_CHUNKS_Y.includes(coords.chunk.y)) {
      return {
        changedChunks: [],
        inventory: this.cloneInventory(inventory),
        inventoryChanged: false,
      };
    }

    const entry = await this.ensureChunkLoaded(coords.chunk);
    const current = entry.chunk.get(coords.local.x, coords.local.y, coords.local.z);
    let nextInventory = inventory;
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
      this.inventory = nextInventory;
      this.inventoryDirty = true;
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

    if (this.inventoryDirty) {
      await this.storage.saveInventory(this.world.name, {
        inventory: this.cloneInventory(await this.ensureInventoryLoaded()),
      });
      this.inventoryDirty = false;
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

  private async ensureInventoryLoaded(): Promise<InventorySnapshot> {
    if (this.inventory) {
      return this.inventory;
    }

    const persisted = await this.storage.loadInventory(this.world.name);
    this.inventory = normalizeInventorySnapshot(persisted?.inventory ?? createDefaultInventory());
    return this.inventory;
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
}
