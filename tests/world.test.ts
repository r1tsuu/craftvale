import { expect, test } from 'bun:test'

import { CHUNK_SIZE } from '../packages/core/src/world/constants.ts'
import { VoxelWorld, worldToChunkCoord } from '../packages/core/src/world/world.ts'

test('worldToChunkCoord handles negative coordinates', () => {
  const coords = worldToChunkCoord(-1, 0, -17)

  expect(coords.chunk).toEqual({ x: -1, y: 0, z: -2 })
  expect(coords.local).toEqual({ x: CHUNK_SIZE - 1, y: 0, z: CHUNK_SIZE - 1 })
})

test('setBlock marks neighboring chunks dirty at boundaries', () => {
  const world = new VoxelWorld()
  const left = world.ensureChunk({ x: -1, y: 0, z: 0 })
  const center = world.ensureChunk({ x: 0, y: 0, z: 0 })

  left.dirty = false
  center.dirty = false

  world.setBlock(0, 1, 1, 3)

  expect(center.dirty).toBe(true)
  expect(left.dirty).toBe(true)
})

test('can read blocks across chunk boundaries', () => {
  const world = new VoxelWorld()
  world.setBlock(CHUNK_SIZE, 2, 0, 3)

  expect(world.getBlock(CHUNK_SIZE, 2, 0)).toBe(3)
})

test('replacing a chunk marks loaded neighbors dirty for mesh rebuilds', () => {
  const world = new VoxelWorld()
  const left = world.ensureChunk({ x: -1, y: 0, z: 0 })
  const center = world.ensureChunk({ x: 0, y: 0, z: 0 })

  left.dirty = false
  center.dirty = false

  world.replaceChunk({ x: 0, y: 0, z: 0 }, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE), 1)

  expect(center.dirty).toBe(true)
  expect(left.dirty).toBe(true)
})
