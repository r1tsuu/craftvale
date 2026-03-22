import type { BlockId, ChunkCoord } from "../types.ts";
import { Chunk } from "./chunk.ts";
import { CHUNK_SIZE, WORLD_LAYER_CHUNKS_Y } from "./constants.ts";

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

const floorDiv = (value: number, size: number): number => Math.floor(value / size);
const mod = (value: number, size: number): number => ((value % size) + size) % size;

export const worldToChunkCoord = (
  x: number,
  y: number,
  z: number,
): { chunk: ChunkCoord; local: ChunkCoord } => {
  const chunk = {
    x: floorDiv(x, CHUNK_SIZE),
    y: floorDiv(y, CHUNK_SIZE),
    z: floorDiv(z, CHUNK_SIZE),
  };

  return {
    chunk,
    local: {
      x: mod(x, CHUNK_SIZE),
      y: mod(y, CHUNK_SIZE),
      z: mod(z, CHUNK_SIZE),
    },
  };
};

const terrainHeight = (worldX: number, worldZ: number): number => {
  const rolling =
    Math.sin(worldX * 0.18) * 1.4 +
    Math.cos(worldZ * 0.14) * 1.1 +
    Math.sin((worldX + worldZ) * 0.07) * 1.8;

  return 6 + Math.floor(rolling);
};

export class VoxelWorld {
  private readonly chunks = new Map<string, Chunk>();

  public ensureChunk(coord: ChunkCoord): Chunk {
    const key = chunkKey(coord);
    const existing = this.chunks.get(key);
    if (existing) {
      return existing;
    }

    const chunk = new Chunk(coord);
    this.populateChunk(chunk);
    this.chunks.set(key, chunk);
    return chunk;
  }

  public getChunk(coord: ChunkCoord): Chunk | undefined {
    return this.chunks.get(chunkKey(coord));
  }

  public getBlock(worldX: number, worldY: number, worldZ: number): BlockId {
    const coords = worldToChunkCoord(worldX, worldY, worldZ);
    const chunk = this.getChunk(coords.chunk);
    return chunk ? chunk.get(coords.local.x, coords.local.y, coords.local.z) : 0;
  }

  public setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId): void {
    const coords = worldToChunkCoord(worldX, worldY, worldZ);
    const chunk = this.ensureChunk(coords.chunk);
    chunk.set(coords.local.x, coords.local.y, coords.local.z, blockId);
    this.markNeighborBoundaries(coords.chunk, coords.local);
  }

  public ensureActiveArea(centerChunkX: number, centerChunkZ: number, radius: number): void {
    for (let chunkZ = centerChunkZ - radius; chunkZ <= centerChunkZ + radius; chunkZ += 1) {
      for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1) {
        for (const chunkY of WORLD_LAYER_CHUNKS_Y) {
          this.ensureChunk({ x: chunkX, y: chunkY, z: chunkZ });
        }
      }
    }
  }

  public getLoadedChunkCoords(): ChunkCoord[] {
    return [...this.chunks.values()].map((chunk) => chunk.coord);
  }

  private populateChunk(chunk: Chunk): void {
    const { x: chunkX, y: chunkY, z: chunkZ } = chunk.coord;

    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const worldX = chunkX * CHUNK_SIZE + localX;
        const worldZ = chunkZ * CHUNK_SIZE + localZ;
        const height = terrainHeight(worldX, worldZ);

        for (let localY = 0; localY < CHUNK_SIZE; localY += 1) {
          const worldY = chunkY * CHUNK_SIZE + localY;
          let blockId: BlockId = 0;

          if (worldY <= height) {
            if (worldY === height) {
              blockId = 1;
            } else if (worldY >= height - 2) {
              blockId = 2;
            } else {
              blockId = 3;
            }
          }

          chunk.set(localX, localY, localZ, blockId);
        }
      }
    }
  }

  private markNeighborBoundaries(chunk: ChunkCoord, local: ChunkCoord): void {
    const maybeDirty = (x: number, y: number, z: number): void => {
      const target = this.getChunk({ x, y, z });
      if (target) {
        target.dirty = true;
      }
    };

    if (local.x === 0) maybeDirty(chunk.x - 1, chunk.y, chunk.z);
    if (local.x === CHUNK_SIZE - 1) maybeDirty(chunk.x + 1, chunk.y, chunk.z);
    if (local.y === 0) maybeDirty(chunk.x, chunk.y - 1, chunk.z);
    if (local.y === CHUNK_SIZE - 1) maybeDirty(chunk.x, chunk.y + 1, chunk.z);
    if (local.z === 0) maybeDirty(chunk.x, chunk.y, chunk.z - 1);
    if (local.z === CHUNK_SIZE - 1) maybeDirty(chunk.x, chunk.y, chunk.z + 1);
  }
}
