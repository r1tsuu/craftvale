import { expect, test } from 'bun:test'

import type { MeshData } from '../packages/core/src/types.ts'

import { getAtlasUvRect } from '../apps/client/src/world/atlas.ts'
import { BLOCK_IDS } from '../packages/core/src/world/blocks.ts'
import { buildChunkMesh } from '../packages/core/src/world/mesher.ts'
import { VoxelWorld } from '../packages/core/src/world/world.ts'

const FLOATS_PER_VERTEX = 8
const VERTICES_PER_FACE = 4
const UV_EPSILON = 1e-6

const getFaceUvs = (mesh: MeshData, faceIndex: number): Array<{ u: number; v: number }> => {
  const start = faceIndex * VERTICES_PER_FACE * FLOATS_PER_VERTEX
  const face: Array<{ u: number; v: number }> = []

  for (let vertex = 0; vertex < VERTICES_PER_FACE; vertex += 1) {
    const offset = start + vertex * FLOATS_PER_VERTEX
    face.push({
      u: mesh.vertexData[offset + 3]!,
      v: mesh.vertexData[offset + 4]!,
    })
  }

  return face
}

const getFaceSkyLights = (mesh: MeshData, faceIndex: number): number[] => {
  const start = faceIndex * VERTICES_PER_FACE * FLOATS_PER_VERTEX
  const face: number[] = []

  for (let vertex = 0; vertex < VERTICES_PER_FACE; vertex += 1) {
    const offset = start + vertex * FLOATS_PER_VERTEX
    face.push(mesh.vertexData[offset + 6]!)
  }

  return face
}

const expectFaceUsesTile = (
  mesh: MeshData,
  faceIndex: number,
  tile: Parameters<typeof getAtlasUvRect>[0],
): void => {
  const rect = getAtlasUvRect(tile)
  const faceUvs = getFaceUvs(mesh, faceIndex)

  for (const uv of faceUvs) {
    expect(uv.u).toBeGreaterThanOrEqual(rect.uMin - UV_EPSILON)
    expect(uv.u).toBeLessThanOrEqual(rect.uMax + UV_EPSILON)
    expect(uv.v).toBeGreaterThanOrEqual(rect.vMin - UV_EPSILON)
    expect(uv.v).toBeLessThanOrEqual(rect.vMax + UV_EPSILON)
  }
}

test('single block emits six faces', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(1, 1, 1, 3)

  const mesh = buildChunkMesh(world, chunk.coord)
  expect(mesh.opaque.indexCount).toBe(36)
  expect(mesh.cutout.indexCount).toBe(0)
})

test('fully enclosed block emits no faces', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true

  for (let z = 0; z < 3; z += 1) {
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        chunk.set(x, y, z, 3)
      }
    }
  }

  const mesh = buildChunkMesh(world, chunk.coord)
  expect(mesh.opaque.indexCount).toBe(54 * 6)
})

test('chunk boundary checks neighbor chunk solidity', () => {
  const world = new VoxelWorld()
  const chunkA = world.ensureChunk({ x: 0, z: 0 })
  const chunkB = world.ensureChunk({ x: 1, z: 0 })

  chunkA.blocks.fill(0)
  chunkB.blocks.fill(0)
  chunkA.set(15, 1, 1, 3)
  chunkB.set(0, 1, 1, 3)

  const mesh = buildChunkMesh(world, chunkA.coord)
  expect(mesh.opaque.indexCount).toBe(30)
})

test('grass uses distinct top, bottom, and side atlas tiles', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(1, 1, 1, 1)

  const mesh = buildChunkMesh(world, chunk.coord)

  expectFaceUsesTile(mesh.opaque, 0, 'grass-side')
  expectFaceUsesTile(mesh.opaque, 2, 'grass-top')
  expectFaceUsesTile(mesh.opaque, 3, 'dirt')
})

test('dirt and stone reuse the same tile on every face', () => {
  const world = new VoxelWorld()
  const dirtChunk = world.ensureChunk({ x: 0, z: 0 })
  dirtChunk.blocks.fill(0)
  dirtChunk.dirty = true
  dirtChunk.set(1, 1, 1, 2)

  const dirtMesh = buildChunkMesh(world, dirtChunk.coord)
  expectFaceUsesTile(dirtMesh.opaque, 0, 'dirt')
  expectFaceUsesTile(dirtMesh.opaque, 2, 'dirt')

  const stoneChunk = world.ensureChunk({ x: 1, z: 0 })
  stoneChunk.blocks.fill(0)
  stoneChunk.dirty = true
  stoneChunk.set(1, 1, 1, 3)

  const stoneMesh = buildChunkMesh(world, stoneChunk.coord)
  expectFaceUsesTile(stoneMesh.opaque, 0, 'stone')
  expectFaceUsesTile(stoneMesh.opaque, 2, 'stone')
})

test('bedrock reuses the bedrock tile on every face', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(1, 1, 1, 10)

  const mesh = buildChunkMesh(world, chunk.coord)
  expect(mesh.cutout.indexCount).toBe(0)
  expectFaceUsesTile(mesh.opaque, 0, 'bedrock')
  expectFaceUsesTile(mesh.opaque, 2, 'bedrock')
})

test('logs use distinct top and side atlas tiles', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(1, 1, 1, 4)

  const mesh = buildChunkMesh(world, chunk.coord)

  expectFaceUsesTile(mesh.opaque, 0, 'log-side')
  expectFaceUsesTile(mesh.opaque, 2, 'log-top')
  expectFaceUsesTile(mesh.opaque, 3, 'log-top')
})

test('leaves emit cutout faces and use the leaves atlas tile', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(1, 1, 1, 5)

  const mesh = buildChunkMesh(world, chunk.coord)

  expect(mesh.opaque.indexCount).toBe(0)
  expect(mesh.cutout.indexCount).toBe(36)
  expectFaceUsesTile(mesh.cutout, 0, 'leaves')
  expectFaceUsesTile(mesh.cutout, 2, 'leaves')
})

test('water emits translucent faces and uses the water atlas tile', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(1, 1, 1, BLOCK_IDS.water)

  const mesh = buildChunkMesh(world, chunk.coord)

  expect(mesh.opaque.indexCount).toBe(0)
  expect(mesh.cutout.indexCount).toBe(0)
  expect(mesh.translucent.indexCount).toBe(36)
  expectFaceUsesTile(mesh.translucent, 0, 'water')
  expectFaceUsesTile(mesh.translucent, 2, 'water')
})

test('placeable opaque blocks use their atlas tile on every face', () => {
  const world = new VoxelWorld()
  const blockChecks: Array<{
    blockId:
      | typeof BLOCK_IDS.sand
      | typeof BLOCK_IDS.planks
      | typeof BLOCK_IDS.cobblestone
      | typeof BLOCK_IDS.brick
      | typeof BLOCK_IDS.coalOre
      | typeof BLOCK_IDS.ironOre
      | typeof BLOCK_IDS.goldOre
      | typeof BLOCK_IDS.diamondOre
    tile:
      | 'sand'
      | 'planks'
      | 'cobblestone'
      | 'brick'
      | 'coal-ore'
      | 'iron-ore'
      | 'gold-ore'
      | 'diamond-ore'
    x: number
  }> = [
    { blockId: BLOCK_IDS.sand, tile: 'sand', x: 0 },
    { blockId: BLOCK_IDS.planks, tile: 'planks', x: 1 },
    { blockId: BLOCK_IDS.cobblestone, tile: 'cobblestone', x: 2 },
    { blockId: BLOCK_IDS.brick, tile: 'brick', x: 3 },
    { blockId: BLOCK_IDS.coalOre, tile: 'coal-ore', x: 4 },
    { blockId: BLOCK_IDS.ironOre, tile: 'iron-ore', x: 5 },
    { blockId: BLOCK_IDS.goldOre, tile: 'gold-ore', x: 6 },
    { blockId: BLOCK_IDS.diamondOre, tile: 'diamond-ore', x: 7 },
  ]

  for (const check of blockChecks) {
    const chunk = world.ensureChunk({ x: check.x, z: 0 })
    chunk.blocks.fill(0)
    chunk.dirty = true
    chunk.set(1, 1, 1, check.blockId)

    const mesh = buildChunkMesh(world, chunk.coord)
    expect(mesh.cutout.indexCount).toBe(0)
    expectFaceUsesTile(mesh.opaque, 0, check.tile)
    expectFaceUsesTile(mesh.opaque, 2, check.tile)
  }
})

test('opaque faces next to leaves are not culled', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(1, 1, 1, 1)
  chunk.set(2, 1, 1, 5)

  const mesh = buildChunkMesh(world, chunk.coord)

  expect(mesh.opaque.indexCount).toBe(36)
  expect(mesh.cutout.indexCount).toBe(30)
})

test('adjacent leaves cull shared internal faces', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(1, 1, 1, 5)
  chunk.set(2, 1, 1, 5)

  const mesh = buildChunkMesh(world, chunk.coord)
  expect(mesh.cutout.indexCount).toBe(60)
})

test('adjacent water culls shared internal faces in the translucent pass', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(1, 1, 1, BLOCK_IDS.water)
  chunk.set(2, 1, 1, BLOCK_IDS.water)

  const mesh = buildChunkMesh(world, chunk.coord)
  expect(mesh.translucent.indexCount).toBe(60)
})

test('opaque faces next to water are not culled', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(1, 1, 1, BLOCK_IDS.grass)
  chunk.set(2, 1, 1, BLOCK_IDS.water)

  const mesh = buildChunkMesh(world, chunk.coord)

  expect(mesh.opaque.indexCount).toBe(36)
  expect(mesh.translucent.indexCount).toBe(30)
})

test('top faces preserve per-vertex light gradients for smooth lighting', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(1, 1, 1, BLOCK_IDS.grass)

  world.setLighting(1, 2, 1, 0, 0)
  world.setLighting(2, 2, 1, 5, 0)
  world.setLighting(1, 2, 2, 10, 0)
  world.setLighting(2, 2, 2, 15, 0)

  const mesh = buildChunkMesh(world, chunk.coord)
  const topFaceSkyLights = getFaceSkyLights(mesh.opaque, 2)

  expect(new Set(topFaceSkyLights).size).toBeGreaterThan(1)
})

test('missing neighbor chunks do not darken boundary faces to zero', () => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  chunk.set(15, 1, 1, BLOCK_IDS.grass)

  for (let sampleY = 0; sampleY <= 2; sampleY += 1) {
    for (let sampleZ = 0; sampleZ <= 2; sampleZ += 1) {
      world.setLighting(15, sampleY, sampleZ, 12, 0)
    }
  }

  const mesh = buildChunkMesh(world, chunk.coord)
  const eastFaceSkyLights = getFaceSkyLights(mesh.opaque, 0)

  for (const value of eastFaceSkyLights) {
    expect(value).toBe(12)
  }
})
