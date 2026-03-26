import { expect, test } from 'bun:test'

import { LightingSystem } from '../packages/core/src/server/lighting-system.ts'
import { BLOCK_IDS } from '../packages/core/src/world/blocks.ts'
import { VoxelWorld } from '../packages/core/src/world/world.ts'

test('skylight spills sideways under a one-block overhang', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })

  chunk.set(8, 76, 8, BLOCK_IDS.grass)
  chunk.set(9, 77, 8, BLOCK_IDS.grass)

  const lightingSystem = new LightingSystem()
  lightingSystem.relightLoadedChunks([chunk], (worldX, worldY, worldZ) =>
    world.getBlock(worldX, worldY, worldZ),
  )

  expect(world.getSkyLight(10, 76, 8)).toBe(15)
  expect(world.getSkyLight(9, 76, 8)).toBe(14)
})

test('skylight keeps its strength while traveling downward after a horizontal spread', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })

  chunk.set(9, 71, 8, BLOCK_IDS.grass)

  const lightingSystem = new LightingSystem()
  lightingSystem.relightLoadedChunks([chunk], (worldX, worldY, worldZ) =>
    world.getBlock(worldX, worldY, worldZ),
  )

  expect(world.getSkyLight(9, 70, 8)).toBe(14)
  expect(world.getSkyLight(9, 69, 8)).toBe(14)
  expect(world.getSkyLight(9, 68, 8)).toBe(14)
})
