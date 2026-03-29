import { dlopen, FFIType, ptr } from 'bun:ffi'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { ChunkCoord } from '../types.ts'
import type { Chunk } from '../world/chunk.ts'

import { Blocks, getBlockEmittedLightLevel } from '../world/blocks.ts'
import { CHUNK_HEIGHT, CHUNK_SIZE, CHUNK_VOLUME } from '../world/constants.ts'

export interface ChunkLightBuffers {
  sky: Uint8Array
  block: Uint8Array
}

export interface LightingChunkInput {
  coord: ChunkCoord
  blocks: Uint8Array
  heightmap: Uint16Array
  passable: Uint8Array
  emitted: Uint8Array
}

export interface NativeLightingBackend {
  relightChunk(chunk: LightingChunkInput, buffers: ChunkLightBuffers): void
  seedExternalBorderLight(
    chunk: LightingChunkInput,
    buffers: ChunkLightBuffers,
    neighbors: {
      east: LightingChunkInput
      west: LightingChunkInput
      south: LightingChunkInput
      north: LightingChunkInput
    },
  ): void
  propagateBorderPair(
    left: LightingChunkInput,
    leftBuffers: ChunkLightBuffers,
    right: LightingChunkInput,
    rightBuffers: ChunkLightBuffers,
    deltaX: number,
    deltaZ: number,
  ): {
    left: boolean
    right: boolean
  }
}

const projectRoot = import.meta.dir.endsWith('/packages/core/src/server')
  ? import.meta.dir.slice(0, -'/packages/core/src/server'.length)
  : import.meta.dir
const libraryPath = join(projectRoot, 'native', 'liblighting.dylib')

const maxBlockId = Math.max(...Object.keys(Blocks).map((value) => Number(value)))
const passableByBlockId = new Uint8Array(maxBlockId + 1)
const emittedLightByBlockId = new Uint8Array(maxBlockId + 1)
for (const [blockIdText, block] of Object.entries(Blocks)) {
  const blockId = Number(blockIdText)
  passableByBlockId[blockId] = block.occlusion !== 'full' ? 1 : 0
  emittedLightByBlockId[blockId] = getBlockEmittedLightLevel(block.id)
}

const buildLightingMetadata = (
  blocks: Uint8Array,
): {
  passable: Uint8Array
  emitted: Uint8Array
} => {
  const passable = new Uint8Array(blocks.length)
  const emitted = new Uint8Array(blocks.length)
  for (let index = 0; index < blocks.length; index += 1) {
    const blockId = blocks[index] ?? 0
    passable[index] = passableByBlockId[blockId] ?? 0
    emitted[index] = emittedLightByBlockId[blockId] ?? 0
  }

  return {
    passable,
    emitted,
  }
}

export const createLightingChunkInput = (
  coord: ChunkCoord,
  blocks: Uint8Array,
  heightmap: Uint16Array,
): LightingChunkInput => {
  const { passable, emitted } = buildLightingMetadata(blocks)
  return {
    coord,
    blocks,
    heightmap,
    passable,
    emitted,
  }
}

export const createLightingChunkInputFromChunk = (chunk: Chunk): LightingChunkInput =>
  createLightingChunkInput(chunk.coord, chunk.blocks, chunk.heightmap)

export const createLightingChunkInputFromBlockResolver = (
  coord: ChunkCoord,
  getBlockAt: (worldX: number, worldY: number, worldZ: number) => number,
): LightingChunkInput => {
  const blocks = new Uint8Array(CHUNK_VOLUME)
  const heightmap = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE)
  const originX = coord.x * CHUNK_SIZE
  const originZ = coord.z * CHUNK_SIZE

  for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
    for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
      let highestNonAir = 0
      for (let localY = 0; localY < CHUNK_HEIGHT; localY += 1) {
        const blockId = getBlockAt(originX + localX, localY, originZ + localZ)
        const index = localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * localY)
        blocks[index] = blockId
        if (blockId !== 0) {
          highestNonAir = localY
        }
      }

      heightmap[localX + CHUNK_SIZE * localZ] = highestNonAir
    }
  }

  return createLightingChunkInput(coord, blocks, heightmap)
}

let backend: NativeLightingBackend | null = null

const loadNativeLightingBackend = (): NativeLightingBackend => {
  if (process.platform !== 'darwin') {
    throw new Error('Native lighting currently supports macOS only.')
  }

  if (!existsSync(libraryPath)) {
    throw new Error(
      `Missing native lighting library at ${libraryPath}. Run "bun run build:native" first.`,
    )
  }

  const library = dlopen(libraryPath, {
    lighting_relight_chunk: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
    lighting_seed_external_border_light: {
      args: [
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
      ],
      returns: FFIType.i32,
    },
    lighting_propagate_border_pair: {
      args: [
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.i32,
        FFIType.i32,
      ],
      returns: FFIType.i32,
    },
  })

  return {
    relightChunk(chunk, buffers) {
      const status = library.symbols.lighting_relight_chunk(
        ptr(chunk.blocks),
        ptr(chunk.passable),
        ptr(chunk.emitted),
        ptr(chunk.heightmap),
        ptr(buffers.sky),
        ptr(buffers.block),
      )
      if (status !== 0) {
        throw new Error(`Native lighting relight failed with status ${status}.`)
      }
    },
    seedExternalBorderLight(chunk, buffers, neighbors) {
      const status = library.symbols.lighting_seed_external_border_light(
        ptr(chunk.passable),
        ptr(buffers.sky),
        ptr(buffers.block),
        ptr(neighbors.east.blocks),
        ptr(neighbors.east.passable),
        ptr(neighbors.east.emitted),
        ptr(neighbors.east.heightmap),
        ptr(neighbors.west.blocks),
        ptr(neighbors.west.passable),
        ptr(neighbors.west.emitted),
        ptr(neighbors.west.heightmap),
        ptr(neighbors.south.blocks),
        ptr(neighbors.south.passable),
        ptr(neighbors.south.emitted),
        ptr(neighbors.south.heightmap),
        ptr(neighbors.north.blocks),
        ptr(neighbors.north.passable),
        ptr(neighbors.north.emitted),
        ptr(neighbors.north.heightmap),
      )
      if (status !== 0) {
        throw new Error(`Native lighting border seeding failed with status ${status}.`)
      }
    },
    propagateBorderPair(left, leftBuffers, right, rightBuffers, deltaX, deltaZ) {
      const status = library.symbols.lighting_propagate_border_pair(
        ptr(left.passable),
        ptr(leftBuffers.sky),
        ptr(leftBuffers.block),
        ptr(right.passable),
        ptr(rightBuffers.sky),
        ptr(rightBuffers.block),
        deltaX,
        deltaZ,
      )
      if (status < 0) {
        throw new Error(`Native lighting border propagation failed with status ${status}.`)
      }

      return {
        left: (status & 0x1) !== 0,
        right: (status & 0x2) !== 0,
      }
    },
  }
}

export const createNativeLightingBackend = (): NativeLightingBackend => {
  backend ??= loadNativeLightingBackend()
  return backend
}
