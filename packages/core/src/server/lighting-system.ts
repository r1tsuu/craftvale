import {
  LIGHT_LEVEL_MAX,
  advanceWorldTime,
  cloneWorldTimeState,
  createDefaultWorldTimeState,
  normalizeWorldTimeState,
  type WorldTimeState,
} from "../shared/lighting.ts";
import type { BlockId, ChunkCoord } from "../types.ts";
import { getBlockEmittedLightLevel } from "../world/blocks.ts";
import { Chunk } from "../world/chunk.ts";
import { CHUNK_SIZE } from "../world/constants.ts";

const LIGHT_PADDING_CHUNKS = 1;
const WORLD_MIN_Y = 0;
const WORLD_MAX_Y = CHUNK_SIZE - 1;
const LIGHT_DIRECTIONS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

interface LightRegion {
  minChunkX: number;
  minChunkZ: number;
  width: number;
  depth: number;
  skyLight: Uint8Array;
  blockLight: Uint8Array;
}

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

const isLightPassable = (blockId: BlockId): boolean => blockId === 0;

export class LightingSystem {
  private worldTime = createDefaultWorldTimeState();

  public getTimeState(): WorldTimeState {
    return cloneWorldTimeState(this.worldTime);
  }

  public setTimeState(time: WorldTimeState): WorldTimeState {
    this.worldTime = normalizeWorldTimeState(time);
    return this.getTimeState();
  }

  public advanceTime(deltaTicks: number): WorldTimeState {
    this.worldTime = advanceWorldTime(this.worldTime, deltaTicks);
    return this.getTimeState();
  }

  public relightLoadedChunks(
    chunks: readonly Chunk[],
    getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
  ): ChunkCoord[] {
    if (chunks.length === 0) {
      return [];
    }

    const region = this.buildLightRegion(chunks, getBlockAt);
    const changedCoords: ChunkCoord[] = [];

    for (const chunk of chunks) {
      const nextSkyLight = new Uint8Array(chunk.skyLight.length);
      const nextBlockLight = new Uint8Array(chunk.blockLight.length);
      let changed = false;

      for (let localY = 0; localY < CHUNK_SIZE; localY += 1) {
        for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
          for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
            const worldX = chunk.coord.x * CHUNK_SIZE + localX;
            const worldZ = chunk.coord.z * CHUNK_SIZE + localZ;
            const regionIndex = this.getRegionIndex(region, worldX, localY, worldZ);
            const chunkIndex = localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * localY);
            const skyValue = region.skyLight[regionIndex] ?? 0;
            const blockValue = region.blockLight[regionIndex] ?? 0;
            nextSkyLight[chunkIndex] = skyValue;
            nextBlockLight[chunkIndex] = blockValue;
            if (
              !changed &&
              (chunk.skyLight[chunkIndex] !== skyValue || chunk.blockLight[chunkIndex] !== blockValue)
            ) {
              changed = true;
            }
          }
        }
      }

      if (changed) {
        chunk.replaceLighting(nextSkyLight, nextBlockLight);
        changedCoords.push(chunk.coord);
      }
    }

    return changedCoords;
  }

  private buildLightRegion(
    chunks: readonly Chunk[],
    getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
  ): LightRegion {
    let minChunkX = Number.POSITIVE_INFINITY;
    let maxChunkX = Number.NEGATIVE_INFINITY;
    let minChunkZ = Number.POSITIVE_INFINITY;
    let maxChunkZ = Number.NEGATIVE_INFINITY;

    for (const chunk of chunks) {
      minChunkX = Math.min(minChunkX, chunk.coord.x);
      maxChunkX = Math.max(maxChunkX, chunk.coord.x);
      minChunkZ = Math.min(minChunkZ, chunk.coord.z);
      maxChunkZ = Math.max(maxChunkZ, chunk.coord.z);
    }

    minChunkX -= LIGHT_PADDING_CHUNKS;
    maxChunkX += LIGHT_PADDING_CHUNKS;
    minChunkZ -= LIGHT_PADDING_CHUNKS;
    maxChunkZ += LIGHT_PADDING_CHUNKS;

    const width = (maxChunkX - minChunkX + 1) * CHUNK_SIZE;
    const depth = (maxChunkZ - minChunkZ + 1) * CHUNK_SIZE;
    const volume = width * depth * CHUNK_SIZE;
    const skyLight = new Uint8Array(volume);
    const blockLight = new Uint8Array(volume);
    const skyQueue: number[] = [];
    const blockQueue: number[] = [];

    for (let localZ = 0; localZ < depth; localZ += 1) {
      for (let localX = 0; localX < width; localX += 1) {
        const worldX = minChunkX * CHUNK_SIZE + localX;
        const worldZ = minChunkZ * CHUNK_SIZE + localZ;
        let blocked = false;

        for (let worldY = WORLD_MAX_Y; worldY >= WORLD_MIN_Y; worldY -= 1) {
          const blockId = getBlockAt(worldX, worldY, worldZ);
          if (!isLightPassable(blockId)) {
            blocked = true;
            const emittedLight = getBlockEmittedLightLevel(blockId);
            if (emittedLight > 0) {
              const index = this.getRegionIndex(
                { minChunkX, minChunkZ, width, depth, skyLight, blockLight },
                worldX,
                worldY,
                worldZ,
              );
              blockLight[index] = emittedLight;
              blockQueue.push(index);
            }
            continue;
          }

          const index = this.getRegionIndex(
            { minChunkX, minChunkZ, width, depth, skyLight, blockLight },
            worldX,
            worldY,
            worldZ,
          );
          if (!blocked) {
            skyLight[index] = LIGHT_LEVEL_MAX;
            skyQueue.push(index);
          }
        }
      }
    }

    const region: LightRegion = {
      minChunkX,
      minChunkZ,
      width,
      depth,
      skyLight,
      blockLight,
    };

    this.propagateLight(skyLight, skyQueue, region, getBlockAt);
    this.propagateLight(blockLight, blockQueue, region, getBlockAt);

    return region;
  }

  private propagateLight(
    channel: Uint8Array,
    queue: number[],
    region: LightRegion,
    getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
  ): void {
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const index = queue[queueIndex]!;
      const lightLevel = channel[index] ?? 0;
      if (lightLevel <= 1) {
        continue;
      }

      const { x, y, z } = this.getRegionPosition(region, index);
      for (const [dx, dy, dz] of LIGHT_DIRECTIONS) {
        const nextX = x + dx;
        const nextY = y + dy;
        const nextZ = z + dz;
        if (
          nextY < WORLD_MIN_Y ||
          nextY > WORLD_MAX_Y ||
          nextX < region.minChunkX * CHUNK_SIZE ||
          nextX >= region.minChunkX * CHUNK_SIZE + region.width ||
          nextZ < region.minChunkZ * CHUNK_SIZE ||
          nextZ >= region.minChunkZ * CHUNK_SIZE + region.depth
        ) {
          continue;
        }

        if (!isLightPassable(getBlockAt(nextX, nextY, nextZ))) {
          continue;
        }

        const nextIndex = this.getRegionIndex(region, nextX, nextY, nextZ);
        const nextLight = lightLevel - 1;
        if (nextLight <= (channel[nextIndex] ?? 0)) {
          continue;
        }

        channel[nextIndex] = nextLight;
        queue.push(nextIndex);
      }
    }
  }

  private getRegionIndex(
    region: LightRegion,
    worldX: number,
    worldY: number,
    worldZ: number,
  ): number {
    const localX = worldX - region.minChunkX * CHUNK_SIZE;
    const localZ = worldZ - region.minChunkZ * CHUNK_SIZE;
    return localX + region.width * (localZ + region.depth * worldY);
  }

  private getRegionPosition(region: LightRegion, index: number): {
    x: number;
    y: number;
    z: number;
  } {
    const plane = region.width * region.depth;
    const y = Math.floor(index / plane);
    const withinPlane = index - y * plane;
    const z = Math.floor(withinPlane / region.width);
    const x = withinPlane - z * region.width;
    return {
      x: region.minChunkX * CHUNK_SIZE + x,
      y,
      z: region.minChunkZ * CHUNK_SIZE + z,
    };
  }
}
