import { expect, test } from 'bun:test'

import { sampleRenderLightingAtPosition } from '../apps/client/src/render/render-lighting.ts'
import { VoxelWorld } from '../packages/core/src/world/world.ts'

test('sampleRenderLightingAtPosition reads world lighting from the containing block cell', () => {
  const world = new VoxelWorld()
  world.ensureChunk({ x: 0, z: 0 })
  world.setLighting(3, 7, 5, 11, 4)

  expect(
    sampleRenderLightingAtPosition(world, {
      x: 3.8,
      y: 7.25,
      z: 5.1,
    }),
  ).toEqual({
    skyLight: 11,
    blockLight: 4,
  })
})

test('sampleRenderLightingAtPosition supports negative world coordinates', () => {
  const world = new VoxelWorld()
  world.ensureChunk({ x: -1, z: -1 })
  world.setLighting(-1, 12, -1, 6, 9)

  expect(
    sampleRenderLightingAtPosition(world, {
      x: -0.2,
      y: 12.9,
      z: -0.3,
    }),
  ).toEqual({
    skyLight: 6,
    blockLight: 9,
  })
})
