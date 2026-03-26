import { expect, test } from 'bun:test'

import { getBiomeAt } from '../packages/core/src/world/biomes.ts'
import { BLOCK_IDS } from '../packages/core/src/world/blocks.ts'
import {
  createGeneratedChunk,
  getTerrainHeight,
  WORLD_WATER_LEVEL,
} from '../packages/core/src/world/terrain.ts'

const getLocalCoord = (world: number): number => ((world % 16) + 16) % 16

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
      if (height < WORLD_WATER_LEVEL) {
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
  const chunk = createGeneratedChunk(
    {
      x: Math.floor(lowColumn.worldX / 16),
      y: 0,
      z: Math.floor(lowColumn.worldZ / 16),
    },
    seed,
  )

  expect(
    chunk.get(
      getLocalCoord(lowColumn.worldX),
      lowColumn.height + 1,
      getLocalCoord(lowColumn.worldZ),
    ),
  ).toBe(BLOCK_IDS.water)
})

test('water generation remains consistent across chunk borders', () => {
  const seed = 42
  const leftChunk = createGeneratedChunk({ x: 0, y: 0, z: 0 }, seed)
  const rightChunk = createGeneratedChunk({ x: 1, y: 0, z: 0 }, seed)

  for (let z = 0; z < 16; z += 1) {
    const leftHeight = getTerrainHeight(seed, 15, z)
    const rightHeight = getTerrainHeight(seed, 16, z)

    const leftAboveSurface = Math.min(leftHeight + 1, 15)
    const rightAboveSurface = Math.min(rightHeight + 1, 15)

    expect(leftChunk.get(15, leftAboveSurface, z) === BLOCK_IDS.water).toBe(
      leftHeight < WORLD_WATER_LEVEL,
    )
    expect(rightChunk.get(0, rightAboveSurface, z) === BLOCK_IDS.water).toBe(
      rightHeight < WORLD_WATER_LEVEL,
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
  const chunkA = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42)
  const chunkB = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42)

  expect(chunkA.blocks).toEqual(chunkB.blocks)

  let logs = 0
  let leaves = 0
  for (const blockId of chunkA.blocks) {
    if (blockId === 4) logs += 1
    if (blockId === 5) leaves += 1
  }

  expect(logs).toBeGreaterThan(0)
  expect(leaves).toBeGreaterThan(0)
})

test('forest chunks still generate trunks above grass surface blocks', () => {
  const chunk = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42)
  let trunkBases = 0

  for (let y = 1; y < 16; y += 1) {
    for (let z = 0; z < 16; z += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (chunk.get(x, y, z) === 4 && chunk.get(x, y - 1, z) === 1) {
          trunkBases += 1
        }
      }
    }
  }

  expect(trunkBases).toBeGreaterThan(0)
})

test('forest tree canopies remain consistent across chunk borders', () => {
  const left = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42)
  const right = createGeneratedChunk({ x: 1, y: 0, z: 0 }, 42)
  let sharedCanopyBlocks = 0

  for (let y = 0; y < 16; y += 1) {
    for (let z = 0; z < 16; z += 1) {
      if (left.get(15, y, z) === 5 && right.get(0, y, z) === 5) {
        sharedCanopyBlocks += 1
      }
    }
  }

  expect(sharedCanopyBlocks).toBeGreaterThan(0)
})

test('different seeds produce different tree layouts', () => {
  const chunkA = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42)
  const chunkB = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 43)
  const treeBlocksA: number[] = []
  const treeBlocksB: number[] = []

  for (let index = 0; index < chunkA.blocks.length; index += 1) {
    const blockA = chunkA.blocks[index]
    const blockB = chunkB.blocks[index]
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
  const forestChunk = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42)
  const scrubChunk = createGeneratedChunk({ x: -5, y: 0, z: 0 }, 42)
  let forestLeaves = 0
  let scrubLeaves = 0

  for (const blockId of forestChunk.blocks) {
    if (blockId === 5) forestLeaves += 1
  }
  for (const blockId of scrubChunk.blocks) {
    if (blockId === 5) scrubLeaves += 1
  }

  expect(forestLeaves).toBeGreaterThan(scrubLeaves)
})

test('representative scrub and highlands chunks change surface materials', () => {
  const scrubChunk = createGeneratedChunk({ x: -5, y: 0, z: 0 }, 42)
  const highlandsChunk = createGeneratedChunk({ x: 1, y: 0, z: 5 }, 42)
  let scrubSurfaceDirt = 0
  let scrubSurfaceStone = 0
  let highlandsSurfaceStone = 0

  for (let z = 0; z < 16; z += 1) {
    for (let x = 0; x < 16; x += 1) {
      const scrubHeight = getTerrainHeight(42, -5 * 16 + x, z)
      const scrubTop = scrubChunk.get(x, scrubHeight, z)
      if (scrubTop === 2) scrubSurfaceDirt += 1
      if (scrubTop === 3) scrubSurfaceStone += 1

      const highlandsHeight = getTerrainHeight(42, 1 * 16 + x, 5 * 16 + z)
      const highlandsTop = highlandsChunk.get(x, highlandsHeight, z)
      if (highlandsTop === 3) highlandsSurfaceStone += 1
    }
  }

  expect(scrubSurfaceDirt).toBeGreaterThan(0)
  expect(scrubSurfaceStone).toBeGreaterThan(0)
  expect(highlandsSurfaceStone).toBeGreaterThan(200)
})
