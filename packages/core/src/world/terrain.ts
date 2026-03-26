import type { BlockId, ChunkCoord } from '../types.ts'

import { type BiomeDefinition, Biomes, getBiomeAt, sampleBiome } from './biomes.ts'
import { BLOCK_IDS } from './blocks.ts'
import { Chunk } from './chunk.ts'
import { CHUNK_HEIGHT, CHUNK_SIZE, WORLD_MAX_BLOCK_Y, WORLD_SEA_LEVEL } from './constants.ts'
import { clamp, hash2dInt, hash3dInt, sampleValueNoise, sampleValueNoise3d } from './noise.ts'
import { ORE_GENERATION_CONFIGS } from './ore-config.ts'

const TREE_CELL_SIZE = 7
const TREE_MAX_TRUNK_HEIGHT = 5
const TREE_MAX_SURFACE_HEIGHT = WORLD_MAX_BLOCK_Y - (TREE_MAX_TRUNK_HEIGHT + 2)
export const WORLD_WATER_LEVEL = WORLD_SEA_LEVEL
const CAVE_MIN_Y = 3
const CAVE_REGION_SCALE = 72
const CAVE_CHAMBER_SCALE = 34
const CAVE_TUNNEL_SCALE = 18
const CAVE_DETAIL_SCALE = 11

interface TreeAnchor {
  x: number
  z: number
  surfaceY: number
  trunkHeight: number
  canopyRadius: 1 | 2
}

const floorDiv = (value: number, size: number): number => Math.floor(value / size)

const toUnit = (value: number): number => (value + 1) * 0.5

const getBiomeHeightParameters = (
  seed: number,
  worldX: number,
  worldZ: number,
): {
  baseHeight: number
  waveAmplitude: number
  largeNoiseAmplitude: number
  detailNoiseAmplitude: number
} => {
  const sample = sampleBiome(seed, worldX, worldZ)
  let baseHeight = 0
  let waveAmplitude = 0
  let largeNoiseAmplitude = 0
  let detailNoiseAmplitude = 0

  for (const [biomeId, weight] of Object.entries(sample.weights) as Array<
    [keyof typeof sample.weights, number]
  >) {
    const biome = Biomes[biomeId]
    baseHeight += biome.baseHeight * weight
    waveAmplitude += biome.waveAmplitude * weight
    largeNoiseAmplitude += biome.largeNoiseAmplitude * weight
    detailNoiseAmplitude += biome.detailNoiseAmplitude * weight
  }

  return {
    baseHeight,
    waveAmplitude,
    largeNoiseAmplitude,
    detailNoiseAmplitude,
  }
}

export const getTerrainHeight = (seed: number, worldX: number, worldZ: number): number => {
  const seedX = (seed & 0xffff) / 4096
  const seedZ = ((seed >>> 16) & 0xffff) / 4096
  const params = getBiomeHeightParameters(seed, worldX, worldZ)
  const rollingWaves =
    Math.sin((worldX + seedX * 19) * 0.16) * (0.8 * params.waveAmplitude) +
    Math.cos((worldZ - seedZ * 17) * 0.13) * (0.6 * params.waveAmplitude) +
    Math.sin((worldX + worldZ + seedX * 11 - seedZ * 13) * 0.065) * params.waveAmplitude
  const largeNoise =
    sampleValueNoise(worldX, worldZ, seed ^ 0x9e3779b9, 16) * params.largeNoiseAmplitude
  const detailNoise =
    sampleValueNoise(worldX, worldZ, seed ^ 0x85ebca6b, 6) * params.detailNoiseAmplitude
  const height = params.baseHeight + rollingWaves + largeNoise + detailNoise

  return clamp(Math.round(height), 1, WORLD_MAX_BLOCK_Y - 1)
}

const getColumnBlocksForBiome = (
  biome: BiomeDefinition,
  height: number,
  worldY: number,
): BlockId => {
  if (worldY === 0) {
    return BLOCK_IDS.bedrock
  }

  if (worldY > height) {
    if (worldY <= WORLD_WATER_LEVEL) {
      return BLOCK_IDS.water
    }
    return BLOCK_IDS.air
  }

  if (worldY === height) {
    return biome.surfaceBlock
  }

  if (worldY >= height - 2) {
    return biome.fillerBlock
  }

  return biome.deepBlock
}

const isCarveableTerrainBlock = (blockId: BlockId): boolean =>
  blockId !== BLOCK_IDS.air &&
  blockId !== BLOCK_IDS.water &&
  blockId !== BLOCK_IDS.bedrock &&
  blockId !== BLOCK_IDS.log &&
  blockId !== BLOCK_IDS.leaves

const shouldCarveCaveAt = (
  seed: number,
  worldX: number,
  worldY: number,
  worldZ: number,
  surfaceY: number,
): boolean => {
  if (worldY <= CAVE_MIN_Y || worldY > surfaceY) {
    return false
  }

  const depthBelowSurface = surfaceY - worldY
  if (depthBelowSurface < 0) {
    return false
  }

  const region = toUnit(sampleValueNoise(worldX, worldZ, seed ^ 0x51db27c1, CAVE_REGION_SCALE))
  const chamber = toUnit(
    sampleValueNoise3d(worldX, worldY, worldZ, seed ^ 0x7e31b4d9, CAVE_CHAMBER_SCALE),
  )
  const tunnel =
    1 - Math.abs(sampleValueNoise3d(worldX, worldY, worldZ, seed ^ 0x2c64f18b, CAVE_TUNNEL_SCALE))
  const detail = toUnit(
    sampleValueNoise3d(worldX, worldY, worldZ, seed ^ 0x9af17d23, CAVE_DETAIL_SCALE),
  )
  const caveScore = chamber * 0.38 + tunnel * 0.44 + detail * 0.1 + region * 0.08

  let threshold = 0.76
  if (depthBelowSurface <= 0) {
    threshold += 0.13
  } else if (depthBelowSurface <= 2) {
    threshold += 0.08
  } else if (depthBelowSurface <= 6) {
    threshold += 0.06
  } else if (depthBelowSurface >= 36) {
    threshold -= 0.05
  }

  if (worldY <= WORLD_WATER_LEVEL - 28) {
    threshold -= 0.03
  }

  return caveScore >= threshold
}

const carveChunkCaves = (chunk: Chunk, seed: number): void => {
  const minWorldX = chunk.coord.x * CHUNK_SIZE
  const minWorldZ = chunk.coord.z * CHUNK_SIZE

  for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
    for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
      const worldX = minWorldX + localX
      const worldZ = minWorldZ + localZ
      const surfaceY = getTerrainHeight(seed, worldX, worldZ)

      for (let localY = CAVE_MIN_Y; localY < Math.min(surfaceY, CHUNK_HEIGHT); localY += 1) {
        if (!shouldCarveCaveAt(seed, worldX, localY, worldZ, surfaceY)) {
          continue
        }

        const currentBlock = chunk.get(localX, localY, localZ)
        if (!isCarveableTerrainBlock(currentBlock)) {
          continue
        }

        chunk.set(localX, localY, localZ, BLOCK_IDS.air)
      }
    }
  }
}

const stepDelta = (bits: number): number => {
  if (bits === 0) {
    return -1
  }
  if (bits === 1) {
    return 0
  }
  return 1
}

const generateChunkOres = (chunk: Chunk, seed: number): void => {
  for (const [configIndex, config] of ORE_GENERATION_CONFIGS.entries()) {
    const oreBlockId = BLOCK_IDS[config.blockKey]
    const heightRange = config.maxY - config.minY + 1
    const veinSizeRange = config.veinSizeMax - config.veinSizeMin + 1

    for (let attempt = 0; attempt < config.attemptsPerChunk; attempt += 1) {
      const attemptSeed = hash3dInt(
        chunk.coord.x,
        attempt + configIndex * 97,
        chunk.coord.z,
        seed ^ 0x5f1d36a7,
      )
      let localX = attemptSeed % CHUNK_SIZE
      let localY = config.minY + ((attemptSeed >>> 4) % heightRange)
      let localZ = (attemptSeed >>> 12) % CHUNK_SIZE
      const veinSize = config.veinSizeMin + ((attemptSeed >>> 20) % veinSizeRange)

      for (let node = 0; node < veinSize; node += 1) {
        if (chunk.get(localX, localY, localZ) === BLOCK_IDS.stone) {
          chunk.set(localX, localY, localZ, oreBlockId)
        }

        const worldX = chunk.coord.x * CHUNK_SIZE + localX
        const worldZ = chunk.coord.z * CHUNK_SIZE + localZ
        const stepSeed = hash3dInt(worldX, localY + node, worldZ, attemptSeed ^ 0x3b1e4f5d)

        localX = clamp(localX + stepDelta(stepSeed & 0x3), 0, CHUNK_SIZE - 1)
        localY = clamp(localY + stepDelta((stepSeed >>> 2) & 0x3), config.minY, config.maxY)
        localZ = clamp(localZ + stepDelta((stepSeed >>> 4) & 0x3), 0, CHUNK_SIZE - 1)
      }
    }
  }
}

const setGeneratedBlockIfInChunk = (
  chunk: Chunk,
  worldX: number,
  worldY: number,
  worldZ: number,
  blockId: BlockId,
): void => {
  const minX = chunk.coord.x * CHUNK_SIZE
  const minZ = chunk.coord.z * CHUNK_SIZE
  const localX = worldX - minX
  const localY = worldY
  const localZ = worldZ - minZ

  if (
    localX < 0 ||
    localX >= CHUNK_SIZE ||
    localY < 0 ||
    localY >= CHUNK_HEIGHT ||
    localZ < 0 ||
    localZ >= CHUNK_SIZE
  ) {
    return
  }

  const current = chunk.get(localX, localY, localZ)
  if (blockId === BLOCK_IDS.leaves) {
    if (current === BLOCK_IDS.air) {
      chunk.set(localX, localY, localZ, BLOCK_IDS.leaves)
    }
    return
  }

  chunk.set(localX, localY, localZ, blockId)
}

const getTreeAnchorForCell = (seed: number, cellX: number, cellZ: number): TreeAnchor | null => {
  const cellSeed = hash2dInt(cellX, cellZ, seed ^ 0x51f15e37)
  const worldX = cellX * TREE_CELL_SIZE + 1 + (cellSeed % (TREE_CELL_SIZE - 2))
  const worldZ = cellZ * TREE_CELL_SIZE + 1 + (((cellSeed >>> 6) & 0xffff) % (TREE_CELL_SIZE - 2))
  const biomeId = getBiomeAt(seed, worldX, worldZ)
  const biome = Biomes[biomeId]

  if (cellSeed % 100 >= biome.treeChancePercent || biome.surfaceBlock !== BLOCK_IDS.grass) {
    return null
  }

  const surfaceY = getTerrainHeight(seed, worldX, worldZ)
  if (surfaceY > TREE_MAX_SURFACE_HEIGHT || surfaceY < WORLD_WATER_LEVEL) {
    return null
  }

  if (
    shouldCarveCaveAt(seed, worldX, surfaceY, worldZ, surfaceY) ||
    shouldCarveCaveAt(seed, worldX, surfaceY - 1, worldZ, surfaceY)
  ) {
    return null
  }

  return {
    x: worldX,
    z: worldZ,
    surfaceY,
    trunkHeight:
      biome.trunkHeightMin + ((cellSeed >>> 12) % Math.max(1, biome.trunkHeightVariance)),
    canopyRadius: biome.canopyRadius,
  }
}

const decorateChunkWithTrees = (chunk: Chunk, seed: number): void => {
  const structureRadius = 2
  const minWorldX = chunk.coord.x * CHUNK_SIZE - structureRadius
  const maxWorldX = chunk.coord.x * CHUNK_SIZE + CHUNK_SIZE - 1 + structureRadius
  const minWorldZ = chunk.coord.z * CHUNK_SIZE - structureRadius
  const maxWorldZ = chunk.coord.z * CHUNK_SIZE + CHUNK_SIZE - 1 + structureRadius

  const minCellX = floorDiv(minWorldX, TREE_CELL_SIZE)
  const maxCellX = floorDiv(maxWorldX, TREE_CELL_SIZE)
  const minCellZ = floorDiv(minWorldZ, TREE_CELL_SIZE)
  const maxCellZ = floorDiv(maxWorldZ, TREE_CELL_SIZE)

  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const tree = getTreeAnchorForCell(seed, cellX, cellZ)
      if (!tree) {
        continue
      }

      const trunkBaseY = tree.surfaceY + 1
      const trunkTopY = trunkBaseY + tree.trunkHeight - 1

      for (let worldY = trunkBaseY; worldY <= trunkTopY; worldY += 1) {
        setGeneratedBlockIfInChunk(chunk, tree.x, worldY, tree.z, BLOCK_IDS.log)
      }

      for (let offsetZ = -tree.canopyRadius; offsetZ <= tree.canopyRadius; offsetZ += 1) {
        for (let offsetX = -tree.canopyRadius; offsetX <= tree.canopyRadius; offsetX += 1) {
          if (tree.canopyRadius === 2 && Math.abs(offsetX) === 2 && Math.abs(offsetZ) === 2) {
            continue
          }
          if (tree.canopyRadius === 1 && Math.abs(offsetX) === 1 && Math.abs(offsetZ) === 1) {
            continue
          }

          setGeneratedBlockIfInChunk(
            chunk,
            tree.x + offsetX,
            trunkTopY - 1,
            tree.z + offsetZ,
            BLOCK_IDS.leaves,
          )
          setGeneratedBlockIfInChunk(
            chunk,
            tree.x + offsetX,
            trunkTopY,
            tree.z + offsetZ,
            BLOCK_IDS.leaves,
          )
        }
      }

      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (Math.abs(offsetX) === 1 && Math.abs(offsetZ) === 1) {
            continue
          }

          setGeneratedBlockIfInChunk(
            chunk,
            tree.x + offsetX,
            trunkTopY + 1,
            tree.z + offsetZ,
            BLOCK_IDS.leaves,
          )
        }
      }

      setGeneratedBlockIfInChunk(chunk, tree.x, trunkTopY + 2, tree.z, BLOCK_IDS.leaves)
      setGeneratedBlockIfInChunk(chunk, tree.x, trunkTopY, tree.z, BLOCK_IDS.log)
    }
  }
}

export const populateGeneratedChunk = (chunk: Chunk, seed: number): Chunk => {
  const { x: chunkX, z: chunkZ } = chunk.coord

  for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
    for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
      const worldX = chunkX * CHUNK_SIZE + localX
      const worldZ = chunkZ * CHUNK_SIZE + localZ
      const height = getTerrainHeight(seed, worldX, worldZ)
      const biome = Biomes[getBiomeAt(seed, worldX, worldZ)]

      for (let localY = 0; localY < CHUNK_HEIGHT; localY += 1) {
        const worldY = localY
        chunk.set(localX, localY, localZ, getColumnBlocksForBiome(biome, height, worldY))
      }
    }
  }

  carveChunkCaves(chunk, seed)
  generateChunkOres(chunk, seed)
  decorateChunkWithTrees(chunk, seed)

  chunk.dirty = false
  chunk.revision = 0
  return chunk
}

export const createGeneratedChunk = (coord: ChunkCoord, seed: number): Chunk =>
  populateGeneratedChunk(new Chunk(coord), seed)
