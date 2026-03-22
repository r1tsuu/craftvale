import type { ChunkCoord } from "../types.ts";
import { Chunk } from "./chunk.ts";
import { CHUNK_SIZE } from "./constants.ts";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const lerp = (start: number, end: number, alpha: number): number =>
  start + (end - start) * alpha;

const smoothstep = (value: number): number => value * value * (3 - 2 * value);

const hash2d = (x: number, z: number, seed: number): number => {
  let hash = seed ^ Math.imul(x, 0x45d9f3b) ^ Math.imul(z, 0x27d4eb2d);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash ^= hash >>> 16;
  return ((hash >>> 0) / 0xffffffff) * 2 - 1;
};

const sampleValueNoise = (
  worldX: number,
  worldZ: number,
  seed: number,
  cellSize: number,
): number => {
  const scaledX = worldX / cellSize;
  const scaledZ = worldZ / cellSize;
  const cellX = Math.floor(scaledX);
  const cellZ = Math.floor(scaledZ);
  const tx = smoothstep(scaledX - cellX);
  const tz = smoothstep(scaledZ - cellZ);

  const topLeft = hash2d(cellX, cellZ, seed);
  const topRight = hash2d(cellX + 1, cellZ, seed);
  const bottomLeft = hash2d(cellX, cellZ + 1, seed);
  const bottomRight = hash2d(cellX + 1, cellZ + 1, seed);

  return lerp(lerp(topLeft, topRight, tx), lerp(bottomLeft, bottomRight, tx), tz);
};

export const getTerrainHeight = (seed: number, worldX: number, worldZ: number): number => {
  const seedX = (seed & 0xffff) / 4096;
  const seedZ = ((seed >>> 16) & 0xffff) / 4096;
  const rollingWaves =
    Math.sin((worldX + seedX * 19) * 0.18) * 1.4 +
    Math.cos((worldZ - seedZ * 17) * 0.14) * 1.1 +
    Math.sin((worldX + worldZ + seedX * 11 - seedZ * 13) * 0.07) * 1.8;
  const largeNoise = sampleValueNoise(worldX, worldZ, seed ^ 0x9e3779b9, 14) * 1.1;
  const detailNoise = sampleValueNoise(worldX, worldZ, seed ^ 0x85ebca6b, 6) * 0.35;
  const rolling = rollingWaves + largeNoise + detailNoise;

  return clamp(6 + Math.floor(rolling), 1, CHUNK_SIZE - 2);
};

export const populateGeneratedChunk = (chunk: Chunk, seed: number): Chunk => {
  const { x: chunkX, y: chunkY, z: chunkZ } = chunk.coord;

  for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
    for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
      const worldX = chunkX * CHUNK_SIZE + localX;
      const worldZ = chunkZ * CHUNK_SIZE + localZ;
      const height = getTerrainHeight(seed, worldX, worldZ);

      for (let localY = 0; localY < CHUNK_SIZE; localY += 1) {
        const worldY = chunkY * CHUNK_SIZE + localY;

        if (worldY > height) {
          chunk.set(localX, localY, localZ, 0);
        } else if (worldY === height) {
          chunk.set(localX, localY, localZ, 1);
        } else if (worldY >= height - 2) {
          chunk.set(localX, localY, localZ, 2);
        } else {
          chunk.set(localX, localY, localZ, 3);
        }
      }
    }
  }

  chunk.dirty = false;
  chunk.revision = 0;
  return chunk;
};

export const createGeneratedChunk = (coord: ChunkCoord, seed: number): Chunk =>
  populateGeneratedChunk(new Chunk(coord), seed);
