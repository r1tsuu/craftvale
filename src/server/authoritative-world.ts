import type { BlockId, ChunkCoord } from "../types.ts";
import {
  type ChunkPayload,
  type WorldSummary,
} from "../shared/messages.ts";
import { Chunk } from "../world/chunk.ts";
import { CHUNK_SIZE, WORLD_LAYER_CHUNKS_Y } from "../world/constants.ts";
import { createGeneratedChunk, getTerrainHeight } from "../world/terrain.ts";
import { worldToChunkCoord } from "../world/world.ts";
import type { WorldStorage } from "./world-storage.ts";

interface ServerChunkEntry {
  chunk: Chunk;
  hasOverride: boolean;
  saveDirty: boolean;
}

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

export class AuthoritativeWorld {
  private readonly chunks = new Map<string, ServerChunkEntry>();

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

  public async applyBlockMutation(
    worldX: number,
    worldY: number,
    worldZ: number,
    blockId: BlockId,
  ): Promise<ChunkPayload[]> {
    const coords = worldToChunkCoord(worldX, worldY, worldZ);
    if (!WORLD_LAYER_CHUNKS_Y.includes(coords.chunk.y)) {
      return [];
    }

    const entry = await this.ensureChunkLoaded(coords.chunk);
    const current = entry.chunk.get(coords.local.x, coords.local.y, coords.local.z);
    if (current === blockId) {
      return [];
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

    return [...affected].map((key) => this.toChunkPayload(this.chunks.get(key)!.chunk));
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

  private toChunkPayload(chunk: Chunk): ChunkPayload {
    return {
      coord: chunk.coord,
      blocks: chunk.cloneBlocks(),
      revision: chunk.revision,
    };
  }
}
