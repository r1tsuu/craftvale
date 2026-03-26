import { expect, test } from 'bun:test'

import { getBiomeAt } from '../packages/core/src/world/biomes.ts'
import { BLOCK_IDS } from '../packages/core/src/world/blocks.ts'
import {
  CHUNK_SIZE,
  WORLD_LAYER_CHUNKS_Y,
  WORLD_MAX_BLOCK_Y,
  WORLD_SEA_LEVEL,
} from '../packages/core/src/world/constants.ts'
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
  WORLD_LAYER_CHUNKS_Y.map((chunkY) =>
    createGeneratedChunk({ x: chunkX, y: chunkY, z: chunkZ }, seed),
  )

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
  const chunk = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42)

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
  for (let z = -48; z <= 48; z += 8) {
    for (let x = -48; x <= 48; x += 8) {
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

test('generated trees are deterministic for a fixed seed and chunk', () => {
  const columnA = createGeneratedChunkColumn(42, 0, 0)
  const columnB = createGeneratedChunkColumn(42, 0, 0)

  expect(columnA.map((chunk) => chunk.blocks)).toEqual(columnB.map((chunk) => chunk.blocks))

  let logs = 0
  let leaves = 0
  for (const chunk of columnA) {
    for (const blockId of chunk.blocks) {
      if (blockId === 4) logs += 1
      if (blockId === 5) leaves += 1
    }
  }

  expect(logs).toBeGreaterThan(0)
  expect(leaves).toBeGreaterThan(0)
})

test('forest chunks still generate trunks above grass surface blocks', () => {
  const column = createGeneratedChunkColumn(42, 0, 0)
  let trunkBases = 0

  for (const chunk of column) {
    for (let y = 1; y < CHUNK_SIZE; y += 1) {
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          if (chunk.get(x, y, z) === 4 && chunk.get(x, y - 1, z) === 1) {
            trunkBases += 1
          }
        }
      }
    }

    if (chunk.coord.y === WORLD_LAYER_CHUNKS_Y[0]) {
      continue
    }

    const belowChunk = column[chunk.coord.y - WORLD_LAYER_CHUNKS_Y[0] - 1]
    if (!belowChunk) {
      continue
    }

    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      for (let x = 0; x < CHUNK_SIZE; x += 1) {
        if (chunk.get(x, 0, z) === 4 && belowChunk.get(x, CHUNK_SIZE - 1, z) === 1) {
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

  for (let index = 0; index < leftColumn.length; index += 1) {
    const left = leftColumn[index]!
    const right = rightColumn[index]!
    for (let y = 0; y < CHUNK_SIZE; y += 1) {
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        if (left.get(CHUNK_SIZE - 1, y, z) === 5 && right.get(0, y, z) === 5) {
          sharedCanopyBlocks += 1
        }
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

  for (let chunkIndex = 0; chunkIndex < columnA.length; chunkIndex += 1) {
    const chunkA = columnA[chunkIndex]!
    const chunkB = columnB[chunkIndex]!
    for (let index = 0; index < chunkA.blocks.length; index += 1) {
      const blockA = chunkA.blocks[index]
      const blockB = chunkB.blocks[index]
      if (blockA === 4 || blockA === 5) {
        treeBlocksA.push(chunkIndex, index, blockA)
      }
      if (blockB === 4 || blockB === 5) {
        treeBlocksB.push(chunkIndex, index, blockB)
      }
    }
  }

  expect(treeBlocksA).not.toEqual(treeBlocksB)
})

test('forest chunks generate denser tree coverage than scrub chunks', () => {
  const forestColumn = createGeneratedChunkColumn(42, 0, 0)
  const scrubColumn = createGeneratedChunkColumn(42, -5, 0)
  let forestLeaves = 0
  let scrubLeaves = 0

  for (const chunk of forestColumn) {
    for (const blockId of chunk.blocks) {
      if (blockId === 5) forestLeaves += 1
    }
  }
  for (const chunk of scrubColumn) {
    for (const blockId of chunk.blocks) {
      if (blockId === 5) scrubLeaves += 1
    }
  }

  expect(forestLeaves).toBeGreaterThan(scrubLeaves)
})

test('representative scrub and highlands chunks change surface materials', () => {
  let scrubSurfaceDirt = 0
  let scrubSurfaceStone = 0
  let highlandsSurfaceStone = 0

  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) {
      const scrubWorldX = -5 * CHUNK_SIZE + x
      const scrubWorldZ = z
      const scrubHeight = getTerrainHeight(42, scrubWorldX, scrubWorldZ)
      const scrubTop = getGeneratedBlock(42, scrubWorldX, scrubHeight, scrubWorldZ)
      if (scrubTop === 2) scrubSurfaceDirt += 1
      if (scrubTop === 3) scrubSurfaceStone += 1

      const highlandsWorldX = CHUNK_SIZE + x
      const highlandsWorldZ = 5 * CHUNK_SIZE + z
      const highlandsHeight = getTerrainHeight(42, highlandsWorldX, highlandsWorldZ)
      const highlandsTop = getGeneratedBlock(42, highlandsWorldX, highlandsHeight, highlandsWorldZ)
      if (highlandsTop === 3) highlandsSurfaceStone += 1
    }
  }

  expect(scrubSurfaceDirt).toBeGreaterThan(0)
  expect(scrubSurfaceStone).toBeGreaterThan(0)
  expect(highlandsSurfaceStone).toBeGreaterThan(200)
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
