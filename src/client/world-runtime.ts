import type { ChunkCoord } from "../types.ts";
import { ACTIVE_CHUNK_RADIUS, CHUNK_SIZE, WORLD_LAYER_CHUNKS_Y } from "../world/constants.ts";
import { VoxelWorld } from "../world/world.ts";
import type { ChunkPayload } from "../shared/messages.ts";
import type { IClientAdapter } from "./client-adapter.ts";

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

export class ClientWorldRuntime {
  public readonly world = new VoxelWorld();
  private readonly pendingChunkKeys = new Set<string>();
  private readonly chunkWaiters = new Set<{
    coords: ChunkCoord[];
    resolve: () => void;
  }>();

  public constructor(private readonly adapter: IClientAdapter) {}

  public reset(): void {
    this.world.clear();
    this.pendingChunkKeys.clear();
    this.chunkWaiters.clear();
  }

  public applyChunk(chunk: ChunkPayload): void {
    this.world.replaceChunk(chunk.coord, chunk.blocks, chunk.revision);
    this.pendingChunkKeys.delete(chunkKey(chunk.coord));
    this.resolveWaiters();
  }

  public getChunkCoordsAroundPosition(
    position: readonly [number, number, number],
    radius = ACTIVE_CHUNK_RADIUS,
  ): ChunkCoord[] {
    const centerChunkX = Math.floor(position[0] / CHUNK_SIZE);
    const centerChunkZ = Math.floor(position[2] / CHUNK_SIZE);
    const coords: ChunkCoord[] = [];

    for (let chunkZ = centerChunkZ - radius; chunkZ <= centerChunkZ + radius; chunkZ += 1) {
      for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1) {
        for (const chunkY of WORLD_LAYER_CHUNKS_Y) {
          coords.push({ x: chunkX, y: chunkY, z: chunkZ });
        }
      }
    }

    return coords;
  }

  public async requestMissingChunks(coords: readonly ChunkCoord[]): Promise<void> {
    const missingCoords: ChunkCoord[] = [];

    for (const coord of coords) {
      const key = chunkKey(coord);
      if (this.world.hasChunk(coord) || this.pendingChunkKeys.has(key)) {
        continue;
      }

      this.pendingChunkKeys.add(key);
      missingCoords.push(coord);
    }

    if (missingCoords.length === 0) {
      return;
    }

    try {
      await this.adapter.eventBus.send({
        type: "requestChunks",
        payload: {
          coords: missingCoords,
        },
      });
    } catch (error) {
      for (const coord of missingCoords) {
        this.pendingChunkKeys.delete(chunkKey(coord));
      }
      throw error;
    }
  }

  public async requestChunksAroundPosition(
    position: readonly [number, number, number],
    radius = ACTIVE_CHUNK_RADIUS,
  ): Promise<void> {
    await this.requestMissingChunks(this.getChunkCoordsAroundPosition(position, radius));
  }

  public waitForChunks(coords: readonly ChunkCoord[]): Promise<void> {
    if (coords.every((coord) => this.world.hasChunk(coord))) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.chunkWaiters.add({
        coords: [...coords],
        resolve,
      });
    });
  }

  private resolveWaiters(): void {
    for (const waiter of [...this.chunkWaiters]) {
      if (waiter.coords.every((coord) => this.world.hasChunk(coord))) {
        this.chunkWaiters.delete(waiter);
        waiter.resolve();
      }
    }
  }
}
