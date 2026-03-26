import { expect, test } from 'bun:test'

import { CHUNK_SIZE, CHUNK_VOLUME } from '../packages/core/src/world/constants.ts'
import { VoxelWorld, worldToChunkCoord } from '../packages/core/src/world/world.ts'

test('worldToChunkCoord handles negative coordinates', () => {
  const coords = worldToChunkCoord(-1, 0, -17)

  expect(coords.chunk).toEqual({ x: -1, z: -2 })
  expect(coords.local).toEqual({ x: CHUNK_SIZE - 1, y: 0, z: CHUNK_SIZE - 1 })
})

test('setBlock marks neighboring chunks dirty at boundaries', () => {
  const world = new VoxelWorld()
  const left = world.ensureChunk({ x: -1, z: 0 })
  const center = world.ensureChunk({ x: 0, z: 0 })

  left.dirty = false
  center.dirty = false

  world.setBlock(0, 1, 1, 3)

  expect(center.dirty).toBe(true)
  expect(left.dirty).toBe(true)
})

test('worldToChunkCoord handles tall positive world heights', () => {
  const coords = worldToChunkCoord(2, 255, 3)

  expect(coords.chunk).toEqual({ x: 0, z: 0 })
  expect(coords.local).toEqual({ x: 2, y: 255, z: 3 })
})

test('can read blocks across chunk boundaries', () => {
  const world = new VoxelWorld()
  world.setBlock(CHUNK_SIZE, 2, 0, 3)

  expect(world.getBlock(CHUNK_SIZE, 2, 0)).toBe(3)
})

test('replacing a chunk marks loaded neighbors dirty for mesh rebuilds', () => {
  const world = new VoxelWorld()
  const left = world.ensureChunk({ x: -1, z: 0 })
  const center = world.ensureChunk({ x: 0, z: 0 })

  left.dirty = false
  center.dirty = false

  world.replaceChunk({ x: 0, z: 0 }, new Uint8Array(CHUNK_VOLUME), 1)

  expect(center.dirty).toBe(true)
  expect(left.dirty).toBe(true)
})

test('ensureActiveArea creates one full-height chunk column per horizontal position', () => {
  const world = new VoxelWorld()
  world.ensureActiveArea(0, 0, 0)

  expect(world.getLoadedChunkCoords()).toEqual([{ x: 0, z: 0 }])
})
