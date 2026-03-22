import type { BlockId, ChunkCoord } from "../types.ts";
import { Chunk } from "./chunk.ts";
import { CHUNK_SIZE } from "./constants.ts";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const lerp = (start: number, end: number, alpha: number): number =>
  start + (end - start) * alpha;

const smoothstep = (value: number): number => value * value * (3 - 2 * value);

const hash2dInt = (x: number, z: number, seed: number): number => {
  let hash = seed ^ Math.imul(x, 0x45d9f3b) ^ Math.imul(z, 0x27d4eb2d);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
};

const hash2d = (x: number, z: number, seed: number): number => {
  const hash = hash2dInt(x, z, seed);
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

const TREE_CELL_SIZE = 7;
const TREE_CANOPY_RADIUS = 2;
const TREE_MIN_TRUNK_HEIGHT = 3;
const TREE_MAX_TRUNK_HEIGHT = 4;
const TREE_MAX_SURFACE_HEIGHT = CHUNK_SIZE - (TREE_MAX_TRUNK_HEIGHT + 2);

interface TreeAnchor {
  x: number;
  z: number;
  surfaceY: number;
  trunkHeight: number;
}

const floorDiv = (value: number, size: number): number => Math.floor(value / size);

const getTreeAnchorForCell = (seed: number, cellX: number, cellZ: number): TreeAnchor | null => {
  const cellSeed = hash2dInt(cellX, cellZ, seed ^ 0x51f15e37);
  if ((cellSeed % 100) >= 42) {
    return null;
  }

  const usableCellWidth = TREE_CELL_SIZE - 2;
  const worldX = cellX * TREE_CELL_SIZE + 1 + (cellSeed % usableCellWidth);
  const worldZ =
    cellZ * TREE_CELL_SIZE + 1 + (((cellSeed >>> 6) & 0xffff) % usableCellWidth);
  const surfaceY = getTerrainHeight(seed, worldX, worldZ);
  if (surfaceY > TREE_MAX_SURFACE_HEIGHT) {
    return null;
  }

  return {
    x: worldX,
    z: worldZ,
    surfaceY,
    trunkHeight: TREE_MIN_TRUNK_HEIGHT + ((cellSeed >>> 12) % 2),
  };
};

const setGeneratedBlockIfInChunk = (
  chunk: Chunk,
  worldX: number,
  worldY: number,
  worldZ: number,
  blockId: BlockId,
): void => {
  const minX = chunk.coord.x * CHUNK_SIZE;
  const minY = chunk.coord.y * CHUNK_SIZE;
  const minZ = chunk.coord.z * CHUNK_SIZE;
  const localX = worldX - minX;
  const localY = worldY - minY;
  const localZ = worldZ - minZ;

  if (
    localX < 0 ||
    localX >= CHUNK_SIZE ||
    localY < 0 ||
    localY >= CHUNK_SIZE ||
    localZ < 0 ||
    localZ >= CHUNK_SIZE
  ) {
    return;
  }

  const current = chunk.get(localX, localY, localZ);
  if (blockId === 5) {
    if (current === 0) {
      chunk.set(localX, localY, localZ, 5);
    }
    return;
  }

  chunk.set(localX, localY, localZ, blockId);
};

const decorateChunkWithTrees = (chunk: Chunk, seed: number): void => {
  if (chunk.coord.y !== 0) {
    return;
  }

  const minWorldX = chunk.coord.x * CHUNK_SIZE - TREE_CANOPY_RADIUS;
  const maxWorldX = chunk.coord.x * CHUNK_SIZE + CHUNK_SIZE - 1 + TREE_CANOPY_RADIUS;
  const minWorldZ = chunk.coord.z * CHUNK_SIZE - TREE_CANOPY_RADIUS;
  const maxWorldZ = chunk.coord.z * CHUNK_SIZE + CHUNK_SIZE - 1 + TREE_CANOPY_RADIUS;

  const minCellX = floorDiv(minWorldX, TREE_CELL_SIZE);
  const maxCellX = floorDiv(maxWorldX, TREE_CELL_SIZE);
  const minCellZ = floorDiv(minWorldZ, TREE_CELL_SIZE);
  const maxCellZ = floorDiv(maxWorldZ, TREE_CELL_SIZE);

  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const tree = getTreeAnchorForCell(seed, cellX, cellZ);
      if (!tree) {
        continue;
      }

      const trunkBaseY = tree.surfaceY + 1;
      const trunkTopY = trunkBaseY + tree.trunkHeight - 1;

      for (let worldY = trunkBaseY; worldY <= trunkTopY; worldY += 1) {
        setGeneratedBlockIfInChunk(chunk, tree.x, worldY, tree.z, 4);
      }

      for (let offsetZ = -2; offsetZ <= 2; offsetZ += 1) {
        for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
          if (Math.abs(offsetX) === 2 && Math.abs(offsetZ) === 2) {
            continue;
          }

          setGeneratedBlockIfInChunk(chunk, tree.x + offsetX, trunkTopY - 1, tree.z + offsetZ, 5);
          setGeneratedBlockIfInChunk(chunk, tree.x + offsetX, trunkTopY, tree.z + offsetZ, 5);
        }
      }

      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (Math.abs(offsetX) === 1 && Math.abs(offsetZ) === 1) {
            continue;
          }

          setGeneratedBlockIfInChunk(chunk, tree.x + offsetX, trunkTopY + 1, tree.z + offsetZ, 5);
        }
      }

      setGeneratedBlockIfInChunk(chunk, tree.x, trunkTopY + 2, tree.z, 5);
      setGeneratedBlockIfInChunk(chunk, tree.x, trunkTopY, tree.z, 4);
    }
  }
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

  decorateChunkWithTrees(chunk, seed);

  chunk.dirty = false;
  chunk.revision = 0;
  return chunk;
};

export const createGeneratedChunk = (coord: ChunkCoord, seed: number): Chunk =>
  populateGeneratedChunk(new Chunk(coord), seed);
