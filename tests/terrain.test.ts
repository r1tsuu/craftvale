import { expect, test } from 'bun:test'

import { getBiomeAt } from '../packages/core/src/world/biomes.ts'
import { BLOCK_IDS } from '../packages/core/src/world/blocks.ts'
import {
  CHUNK_SIZE,
  WORLD_MAX_BLOCK_Y,
  WORLD_SEA_LEVEL,
} from '../packages/core/src/world/constants.ts'
import { ORE_GENERATION_CONFIGS } from '../packages/core/src/world/ore-config.ts'
import { createGeneratedChunk, getTerrainHeight } from '../packages/core/src/world/terrain.ts'
import { worldToChunkCoord } from '../packages/core/src/world/world.ts'

const getGeneratedBlock = (
  seed: number,
  worldX: number,
  worldY: number,
  worldZ: number,
): number => {
  const coords = worldToChunkCoord(worldX, worldY, worldZ)
  const chunk = createGeneratedChunk(coords.chunk, seed)
  return chunk.get(coords.local.x, coords.local.y, coords.local.z)
}

const createGeneratedChunkColumn = (seed: number, chunkX: number, chunkZ: number) =>
  createGeneratedChunk({ x: chunkX, z: chunkZ }, seed)

const collectSurfaceBlocksForBiome = (seed: number, biome: string, radius: number): number[] => {
  const surfaceBlocks: number[] = []

  for (let worldZ = -radius; worldZ <= radius; worldZ += 4) {
    for (let worldX = -radius; worldX <= radius; worldX += 4) {
      if (getBiomeAt(seed, worldX, worldZ) !== biome) {
        continue
      }

      const height = getTerrainHeight(seed, worldX, worldZ)
      surfaceBlocks.push(getGeneratedBlock(seed, worldX, height, worldZ))
    }
  }

  return surfaceBlocks
}

const findGeneratedPosition = (
  seed: number,
  chunkRadius: number,
  predicate: (position: {
    worldX: number
    worldY: number
    worldZ: number
    blockId: number
    surfaceY: number
  }) => boolean,
): {
  worldX: number
  worldY: number
  worldZ: number
  blockId: number
  surfaceY: number
} | null => {
  for (let chunkZ = -chunkRadius; chunkZ <= chunkRadius; chunkZ += 1) {
    for (let chunkX = -chunkRadius; chunkX <= chunkRadius; chunkX += 1) {
      const chunk = createGeneratedChunkColumn(seed, chunkX, chunkZ)
      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
          const worldX = chunkX * CHUNK_SIZE + localX
          const worldZ = chunkZ * CHUNK_SIZE + localZ
          const surfaceY = getTerrainHeight(seed, worldX, worldZ)
          for (let worldY = 1; worldY <= surfaceY; worldY += 1) {
            const blockId = chunk.get(localX, worldY, localZ)
            const position = { worldX, worldY, worldZ, blockId, surfaceY }
            if (predicate(position)) {
              return position
            }
          }
        }
      }
    }
  }

  return null
}

const countGeneratedPositions = (
  seed: number,
  chunkRadius: number,
  predicate: (position: {
    worldX: number
    worldY: number
    worldZ: number
    blockId: number
    surfaceY: number
  }) => boolean,
): number => {
  let matches = 0

  for (let chunkZ = -chunkRadius; chunkZ <= chunkRadius; chunkZ += 1) {
    for (let chunkX = -chunkRadius; chunkX <= chunkRadius; chunkX += 1) {
      const chunk = createGeneratedChunkColumn(seed, chunkX, chunkZ)
      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
          const worldX = chunkX * CHUNK_SIZE + localX
          const worldZ = chunkZ * CHUNK_SIZE + localZ
          const surfaceY = getTerrainHeight(seed, worldX, worldZ)
          for (let worldY = 1; worldY <= surfaceY; worldY += 1) {
            const blockId = chunk.get(localX, worldY, localZ)
            if (predicate({ worldX, worldY, worldZ, blockId, surfaceY })) {
              matches += 1
            }
          }
        }
      }
    }
  }

  return matches
}

const collectOreHeights = (seed: number, oreBlockId: number, chunkRadius: number): number[] => {
  const heights: number[] = []

  for (let chunkZ = -chunkRadius; chunkZ <= chunkRadius; chunkZ += 1) {
    for (let chunkX = -chunkRadius; chunkX <= chunkRadius; chunkX += 1) {
      const chunk = createGeneratedChunkColumn(seed, chunkX, chunkZ)
      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        for (let localY = 1; localY < WORLD_MAX_BLOCK_Y; localY += 1) {
          for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
            if (chunk.get(localX, localY, localZ) === oreBlockId) {
              heights.push(localY)
            }
          }
        }
      }
    }
  }

  return heights
}

const findLowElevationColumn = (
  seed: number,
): {
  worldX: number
  worldZ: number
  height: number
} => {
  for (let worldZ = -96; worldZ <= 96; worldZ += 1) {
    for (let worldX = -96; worldX <= 96; worldX += 1) {
      const height = getTerrainHeight(seed, worldX, worldZ)
      if (height < WORLD_SEA_LEVEL) {
        return { worldX, worldZ, height }
      }
    }
  }

  throw new Error('Expected to find at least one low-elevation column below the water level.')
}

test('terrain remains locally smooth between adjacent columns', () => {
  const seed = 123456789

  for (let z = -16; z < 16; z += 1) {
    for (let x = -16; x < 16; x += 1) {
      const center = getTerrainHeight(seed, x, z)
      const right = getTerrainHeight(seed, x + 1, z)
      const forward = getTerrainHeight(seed, x, z + 1)

      expect(Math.abs(center - right)).toBeLessThanOrEqual(2)
      expect(Math.abs(center - forward)).toBeLessThanOrEqual(2)
    }
  }
})

test('different seeds still produce different terrain samples', () => {
  const samplesA: number[] = []
  const samplesB: number[] = []

  for (let index = 0; index < 8; index += 1) {
    samplesA.push(getTerrainHeight(111, 24 + index * 3, -13 + index * 2))
    samplesB.push(getTerrainHeight(222, 24 + index * 3, -13 + index * 2))
  }

  expect(samplesA).not.toEqual(samplesB)
})

test('generated chunks always place bedrock at the bottom layer', () => {
  const chunk = createGeneratedChunk({ x: 0, z: 0 }, 42)

  for (let z = 0; z < 16; z += 1) {
    for (let x = 0; x < 16; x += 1) {
      expect(chunk.get(x, 0, z)).toBe(10)
    }
  }
})

test('generated chunks fill low terrain up to the water level with water', () => {
  const seed = 42
  const lowColumn = findLowElevationColumn(seed)
  expect(getGeneratedBlock(seed, lowColumn.worldX, lowColumn.height + 1, lowColumn.worldZ)).toBe(
    BLOCK_IDS.water,
  )
})

test('water generation remains consistent across chunk borders', () => {
  const seed = 42

  for (let z = 0; z < 16; z += 1) {
    const leftHeight = getTerrainHeight(seed, 15, z)
    const rightHeight = getTerrainHeight(seed, 16, z)

    expect(getGeneratedBlock(seed, 15, leftHeight + 1, z) === BLOCK_IDS.water).toBe(
      leftHeight < WORLD_SEA_LEVEL,
    )
    expect(getGeneratedBlock(seed, 16, rightHeight + 1, z) === BLOCK_IDS.water).toBe(
      rightHeight < WORLD_SEA_LEVEL,
    )
  }
})

test('biome sampling is deterministic and produces multiple biome types', () => {
  const seed = 42
  const sampleA = getBiomeAt(seed, 8, 8)
  const sampleB = getBiomeAt(seed, 8, 8)
  expect(sampleA).toBe(sampleB)

  const biomes = new Set<string>()
  for (let z = -256; z <= 256; z += 16) {
    for (let x = -256; x <= 256; x += 16) {
      biomes.add(getBiomeAt(seed, x, z))
    }
  }

  expect(biomes.size).toBeGreaterThanOrEqual(3)
})

test('different seeds produce different biome layouts', () => {
  const layoutA: string[] = []
  const layoutB: string[] = []

  for (let index = 0; index < 8; index += 1) {
    layoutA.push(getBiomeAt(111, -40 + index * 12, 28 - index * 7))
    layoutB.push(getBiomeAt(222, -40 + index * 12, 28 - index * 7))
  }

  expect(layoutA).not.toEqual(layoutB)
})

test('biomes span multiple chunks instead of changing every chunk or two', () => {
  const seed = 42
  let longestRun = 1
  let currentRun = 1
  let previousBiome = getBiomeAt(seed, -512, 0)

  for (let x = -511; x <= 512; x += 1) {
    const biome = getBiomeAt(seed, x, 0)
    if (biome === previousBiome) {
      currentRun += 1
      continue
    }

    longestRun = Math.max(longestRun, currentRun)
    currentRun = 1
    previousBiome = biome
  }

  longestRun = Math.max(longestRun, currentRun)

  expect(longestRun).toBeGreaterThanOrEqual(CHUNK_SIZE * 6)
})

test('caves create enclosed underground air pockets', () => {
  const seed = 42
  const enclosedCave = findGeneratedPosition(
    seed,
    5,
    ({ blockId, surfaceY, worldX, worldY, worldZ }) => {
      if (blockId !== BLOCK_IDS.air || worldY >= surfaceY - 4 || worldY <= 8) {
        return false
      }

      const blockAbove = getGeneratedBlock(seed, worldX, worldY + 1, worldZ)
      const blockBelow = getGeneratedBlock(seed, worldX, worldY - 1, worldZ)
      return (
        blockAbove !== BLOCK_IDS.air &&
        blockAbove !== BLOCK_IDS.water &&
        blockBelow !== BLOCK_IDS.air &&
        blockBelow !== BLOCK_IDS.water
      )
    },
  )

  expect(enclosedCave).not.toBeNull()
})

test('caves can open to the outside through hillsides or surface breaks', () => {
  const seed = 42
  const outsideOpeningCount = countGeneratedPositions(
    seed,
    4,
    ({ blockId, surfaceY, worldX, worldY, worldZ }) => {
      if (blockId !== BLOCK_IDS.air || worldY < surfaceY - 6) {
        return false
      }

      const horizontalNeighbors = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const

      return horizontalNeighbors.some(([offsetX, offsetZ]) => {
        return getTerrainHeight(seed, worldX + offsetX, worldZ + offsetZ) < worldY
      })
    },
  )

  expect(outsideOpeningCount).toBeGreaterThanOrEqual(20)
})

test('generated trees are deterministic for a fixed seed and chunk', () => {
  const columnA = createGeneratedChunkColumn(42, 0, 0)
  const columnB = createGeneratedChunkColumn(42, 0, 0)

  expect(columnA.blocks).toEqual(columnB.blocks)

  let logs = 0
  let leaves = 0
  for (const blockId of columnA.blocks) {
    if (blockId === 4) logs += 1
    if (blockId === 5) leaves += 1
  }

  expect(logs).toBeGreaterThan(0)
  expect(leaves).toBeGreaterThan(0)
})

test('forest chunks still generate trunks above grass surface blocks', () => {
  const column = createGeneratedChunkColumn(42, 0, 0)
  let trunkBases = 0

  for (let y = 1; y < WORLD_MAX_BLOCK_Y; y += 1) {
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      for (let x = 0; x < CHUNK_SIZE; x += 1) {
        if (column.get(x, y, z) === 4 && column.get(x, y - 1, z) === 1) {
          trunkBases += 1
        }
      }
    }
  }

  expect(trunkBases).toBeGreaterThan(0)
})

test('forest tree canopies remain consistent across chunk borders', () => {
  const leftColumn = createGeneratedChunkColumn(42, 0, 0)
  const rightColumn = createGeneratedChunkColumn(42, 1, 0)
  let sharedCanopyBlocks = 0

  for (let y = 0; y <= WORLD_MAX_BLOCK_Y; y += 1) {
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      if (leftColumn.get(CHUNK_SIZE - 1, y, z) === 5 && rightColumn.get(0, y, z) === 5) {
        sharedCanopyBlocks += 1
      }
    }
  }

  expect(sharedCanopyBlocks).toBeGreaterThan(0)
})

test('different seeds produce different tree layouts', () => {
  const columnA = createGeneratedChunkColumn(42, 0, 0)
  const columnB = createGeneratedChunkColumn(43, 0, 0)
  const treeBlocksA: number[] = []
  const treeBlocksB: number[] = []

  for (let index = 0; index < columnA.blocks.length; index += 1) {
    const blockA = columnA.blocks[index]
    const blockB = columnB.blocks[index]
    if (blockA === 4 || blockA === 5) {
      treeBlocksA.push(index, blockA)
    }
    if (blockB === 4 || blockB === 5) {
      treeBlocksB.push(index, blockB)
    }
  }

  expect(treeBlocksA).not.toEqual(treeBlocksB)
})

test('forest chunks generate denser tree coverage than scrub chunks', () => {
  const forestColumn = createGeneratedChunkColumn(42, 0, 0)
  const scrubColumn = createGeneratedChunkColumn(42, -5, 0)
  let forestLeaves = 0
  let scrubLeaves = 0

  for (const blockId of forestColumn.blocks) {
    if (blockId === 5) forestLeaves += 1
  }
  for (const blockId of scrubColumn.blocks) {
    if (blockId === 5) scrubLeaves += 1
  }

  expect(forestLeaves).toBeGreaterThan(scrubLeaves)
})

test('scrub and highlands biome columns keep their expected surface materials', () => {
  const scrubSurfaceBlocks = collectSurfaceBlocksForBiome(42, 'scrub', 256)
  const highlandsSurfaceBlocks = collectSurfaceBlocksForBiome(42, 'highlands', 256)
  const scrubAllowedSurfaceBlocks = new Set<number>([BLOCK_IDS.air, BLOCK_IDS.dirt, BLOCK_IDS.sand])
  const highlandsAllowedSurfaceBlocks = new Set<number>([
    BLOCK_IDS.air,
    BLOCK_IDS.stone,
    BLOCK_IDS.sand,
    BLOCK_IDS.coalOre,
    BLOCK_IDS.ironOre,
    BLOCK_IDS.goldOre,
    BLOCK_IDS.diamondOre,
  ])
  let scrubDirtSurfaceBlocks = 0
  let highlandsStoneSurfaceBlocks = 0

  expect(scrubSurfaceBlocks.length).toBeGreaterThanOrEqual(20)
  expect(highlandsSurfaceBlocks.length).toBeGreaterThanOrEqual(20)

  for (const blockId of scrubSurfaceBlocks) {
    expect(scrubAllowedSurfaceBlocks.has(blockId)).toBe(true)
    if (blockId === BLOCK_IDS.dirt) {
      scrubDirtSurfaceBlocks += 1
    }
  }

  for (const blockId of highlandsSurfaceBlocks) {
    expect(highlandsAllowedSurfaceBlocks.has(blockId)).toBe(true)
    if (blockId === BLOCK_IDS.stone) {
      highlandsStoneSurfaceBlocks += 1
    }
  }

  expect(scrubDirtSurfaceBlocks).toBeGreaterThanOrEqual(Math.floor(scrubSurfaceBlocks.length * 0.7))
  expect(highlandsStoneSurfaceBlocks).toBeGreaterThanOrEqual(
    Math.floor(highlandsSurfaceBlocks.length * 0.75),
  )
})

test('each ore stays within its configured height range and appears in sampled terrain', () => {
  for (const config of ORE_GENERATION_CONFIGS) {
    const oreHeights = collectOreHeights(42, BLOCK_IDS[config.blockKey], 5)

    expect(oreHeights.length).toBeGreaterThan(0)
    for (const height of oreHeights) {
      expect(height).toBeGreaterThanOrEqual(config.minY)
      expect(height).toBeLessThanOrEqual(config.maxY)
    }
  }
})

test('terrain heights stay within the 256-block world bounds', () => {
  const seed = 42

  for (let z = -128; z <= 128; z += 8) {
    for (let x = -128; x <= 128; x += 8) {
      const height = getTerrainHeight(seed, x, z)
      expect(height).toBeGreaterThanOrEqual(1)
      expect(height).toBeLessThan(WORLD_MAX_BLOCK_Y)
    }
  }
})
