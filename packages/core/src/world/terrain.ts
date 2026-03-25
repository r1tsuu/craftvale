import type { BlockId, ChunkCoord } from "../types.ts";
import { Chunk } from "./chunk.ts";
import { Biomes, getBiomeAt, sampleBiome, type BiomeDefinition } from "./biomes.ts";
import { CHUNK_SIZE } from "./constants.ts";
import { clamp, hash2dInt, sampleValueNoise } from "./noise.ts";

const TREE_CELL_SIZE = 7;
const TREE_MAX_TRUNK_HEIGHT = 5;
const TREE_MAX_SURFACE_HEIGHT = CHUNK_SIZE - (TREE_MAX_TRUNK_HEIGHT + 2);

interface TreeAnchor {
  x: number;
  z: number;
  surfaceY: number;
  trunkHeight: number;
  canopyRadius: 1 | 2;
}

const floorDiv = (value: number, size: number): number => Math.floor(value / size);

const getBiomeHeightParameters = (
  seed: number,
  worldX: number,
  worldZ: number,
): {
  baseHeight: number;
  waveAmplitude: number;
  largeNoiseAmplitude: number;
  detailNoiseAmplitude: number;
} => {
  const sample = sampleBiome(seed, worldX, worldZ);
  let baseHeight = 0;
  let waveAmplitude = 0;
  let largeNoiseAmplitude = 0;
  let detailNoiseAmplitude = 0;

  for (const [biomeId, weight] of Object.entries(sample.weights) as Array<
    [keyof typeof sample.weights, number]
  >) {
    const biome = Biomes[biomeId];
    baseHeight += biome.baseHeight * weight;
    waveAmplitude += biome.waveAmplitude * weight;
    largeNoiseAmplitude += biome.largeNoiseAmplitude * weight;
    detailNoiseAmplitude += biome.detailNoiseAmplitude * weight;
  }

  return {
    baseHeight,
    waveAmplitude,
    largeNoiseAmplitude,
    detailNoiseAmplitude,
  };
};

export const getTerrainHeight = (seed: number, worldX: number, worldZ: number): number => {
  const seedX = (seed & 0xffff) / 4096;
  const seedZ = ((seed >>> 16) & 0xffff) / 4096;
  const params = getBiomeHeightParameters(seed, worldX, worldZ);
  const rollingWaves =
    Math.sin((worldX + seedX * 19) * 0.16) * (0.8 * params.waveAmplitude) +
    Math.cos((worldZ - seedZ * 17) * 0.13) * (0.6 * params.waveAmplitude) +
    Math.sin((worldX + worldZ + seedX * 11 - seedZ * 13) * 0.065) * params.waveAmplitude;
  const largeNoise = sampleValueNoise(worldX, worldZ, seed ^ 0x9e3779b9, 16) *
    params.largeNoiseAmplitude;
  const detailNoise = sampleValueNoise(worldX, worldZ, seed ^ 0x85ebca6b, 6) *
    params.detailNoiseAmplitude;
  const height = params.baseHeight + rollingWaves + largeNoise + detailNoise;

  return clamp(Math.round(height), 1, CHUNK_SIZE - 2);
};

const getColumnBlocksForBiome = (
  biome: BiomeDefinition,
  height: number,
  worldY: number,
): BlockId => {
  if (worldY === 0) {
    return 10;
  }

  if (worldY > height) {
    return 0;
  }

  if (worldY === height) {
    return biome.surfaceBlock;
  }

  if (worldY >= height - 2) {
    return biome.fillerBlock;
  }

  return biome.deepBlock;
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

const getTreeAnchorForCell = (seed: number, cellX: number, cellZ: number): TreeAnchor | null => {
  const cellSeed = hash2dInt(cellX, cellZ, seed ^ 0x51f15e37);
  const worldX = cellX * TREE_CELL_SIZE + 1 + (cellSeed % (TREE_CELL_SIZE - 2));
  const worldZ = cellZ * TREE_CELL_SIZE + 1 + (((cellSeed >>> 6) & 0xffff) % (TREE_CELL_SIZE - 2));
  const biomeId = getBiomeAt(seed, worldX, worldZ);
  const biome = Biomes[biomeId];

  if ((cellSeed % 100) >= biome.treeChancePercent || biome.surfaceBlock !== 1) {
    return null;
  }

  const surfaceY = getTerrainHeight(seed, worldX, worldZ);
  if (surfaceY > TREE_MAX_SURFACE_HEIGHT) {
    return null;
  }

  return {
    x: worldX,
    z: worldZ,
    surfaceY,
    trunkHeight: biome.trunkHeightMin + ((cellSeed >>> 12) % Math.max(1, biome.trunkHeightVariance)),
    canopyRadius: biome.canopyRadius,
  };
};

const decorateChunkWithTrees = (chunk: Chunk, seed: number): void => {
  if (chunk.coord.y !== 0) {
    return;
  }

  const structureRadius = 2;
  const minWorldX = chunk.coord.x * CHUNK_SIZE - structureRadius;
  const maxWorldX = chunk.coord.x * CHUNK_SIZE + CHUNK_SIZE - 1 + structureRadius;
  const minWorldZ = chunk.coord.z * CHUNK_SIZE - structureRadius;
  const maxWorldZ = chunk.coord.z * CHUNK_SIZE + CHUNK_SIZE - 1 + structureRadius;

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

      for (let offsetZ = -tree.canopyRadius; offsetZ <= tree.canopyRadius; offsetZ += 1) {
        for (let offsetX = -tree.canopyRadius; offsetX <= tree.canopyRadius; offsetX += 1) {
          if (tree.canopyRadius === 2 && Math.abs(offsetX) === 2 && Math.abs(offsetZ) === 2) {
            continue;
          }
          if (tree.canopyRadius === 1 && Math.abs(offsetX) === 1 && Math.abs(offsetZ) === 1) {
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
      const biome = Biomes[getBiomeAt(seed, worldX, worldZ)];

      for (let localY = 0; localY < CHUNK_SIZE; localY += 1) {
        const worldY = chunkY * CHUNK_SIZE + localY;
        chunk.set(localX, localY, localZ, getColumnBlocksForBiome(biome, height, worldY));
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
