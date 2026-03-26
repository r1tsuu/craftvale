import type { BlockId, ChunkCoord } from '../types.ts'
import type { Chunk } from '../world/chunk.ts'

import {
  advanceWorldTime,
  cloneWorldTimeState,
  createDefaultWorldTimeState,
  LIGHT_LEVEL_MAX,
  normalizeWorldTimeState,
  type WorldTimeState,
} from '../shared/lighting.ts'
import { BLOCK_IDS, getBlockEmittedLightLevel } from '../world/blocks.ts'
import {
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  WORLD_HEIGHT_BLOCKS,
  WORLD_MAX_BLOCK_Y,
  WORLD_MIN_BLOCK_Y,
} from '../world/constants.ts'

const LIGHT_PADDING_CHUNKS = 1
const LIGHT_DIRECTIONS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const
const HORIZONTAL_LIGHT_DIRECTIONS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const

interface LightRegion {
  minChunkX: number
  minChunkZ: number
  width: number
  depth: number
  height: number
  skyLight: Uint8Array
  blockLight: Uint8Array
}

const isLightPassable = (blockId: BlockId): boolean => blockId === BLOCK_IDS.air

export class LightingSystem {
  private worldTime = createDefaultWorldTimeState()

  public getTimeState(): WorldTimeState {
    return cloneWorldTimeState(this.worldTime)
  }

  public setTimeState(time: WorldTimeState): WorldTimeState {
    this.worldTime = normalizeWorldTimeState(time)
    return this.getTimeState()
  }

  public advanceTime(deltaTicks: number): WorldTimeState {
    this.worldTime = advanceWorldTime(this.worldTime, deltaTicks)
    return this.getTimeState()
  }

  public relightLoadedChunks(
    chunks: readonly Chunk[],
    getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
  ): ChunkCoord[] {
    if (chunks.length === 0) {
      return []
    }

    const region = this.buildLightRegion(chunks, getBlockAt)
    const changedCoords: ChunkCoord[] = []

    for (const chunk of chunks) {
      const nextSkyLight = new Uint8Array(chunk.skyLight.length)
      const nextBlockLight = new Uint8Array(chunk.blockLight.length)
      let changed = false

      for (let localY = 0; localY < CHUNK_HEIGHT; localY += 1) {
        for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
          for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
            const worldX = chunk.coord.x * CHUNK_SIZE + localX
            const worldY = localY
            const worldZ = chunk.coord.z * CHUNK_SIZE + localZ
            const regionIndex = this.getRegionIndex(region, worldX, worldY, worldZ)
            const chunkIndex = localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * localY)
            const skyValue = region.skyLight[regionIndex] ?? 0
            const blockValue = region.blockLight[regionIndex] ?? 0
            nextSkyLight[chunkIndex] = skyValue
            nextBlockLight[chunkIndex] = blockValue
            if (
              !changed &&
              (chunk.skyLight[chunkIndex] !== skyValue ||
                chunk.blockLight[chunkIndex] !== blockValue)
            ) {
              changed = true
            }
          }
        }
      }

      if (changed) {
        chunk.replaceLighting(nextSkyLight, nextBlockLight)
        changedCoords.push(chunk.coord)
      }
    }

    return changedCoords
  }

  private buildLightRegion(
    chunks: readonly Chunk[],
    getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
  ): LightRegion {
    let minChunkX = Number.POSITIVE_INFINITY
    let maxChunkX = Number.NEGATIVE_INFINITY
    let minChunkZ = Number.POSITIVE_INFINITY
    let maxChunkZ = Number.NEGATIVE_INFINITY

    for (const chunk of chunks) {
      minChunkX = Math.min(minChunkX, chunk.coord.x)
      maxChunkX = Math.max(maxChunkX, chunk.coord.x)
      minChunkZ = Math.min(minChunkZ, chunk.coord.z)
      maxChunkZ = Math.max(maxChunkZ, chunk.coord.z)
    }

    minChunkX -= LIGHT_PADDING_CHUNKS
    maxChunkX += LIGHT_PADDING_CHUNKS
    minChunkZ -= LIGHT_PADDING_CHUNKS
    maxChunkZ += LIGHT_PADDING_CHUNKS

    const width = (maxChunkX - minChunkX + 1) * CHUNK_SIZE
    const depth = (maxChunkZ - minChunkZ + 1) * CHUNK_SIZE
    const height = WORLD_HEIGHT_BLOCKS
    const volume = width * depth * height
    const skyLight = new Uint8Array(volume)
    const blockLight = new Uint8Array(volume)
    const directSkyIndices: number[] = []
    const skyQueue: number[] = []
    const blockQueue: number[] = []

    const region: LightRegion = {
      minChunkX,
      minChunkZ,
      width,
      depth,
      height,
      skyLight,
      blockLight,
    }

    for (let localZ = 0; localZ < depth; localZ += 1) {
      for (let localX = 0; localX < width; localX += 1) {
        const worldX = minChunkX * CHUNK_SIZE + localX
        const worldZ = minChunkZ * CHUNK_SIZE + localZ
        let skylightBlocked = false

        for (let worldY = WORLD_MAX_BLOCK_Y; worldY >= WORLD_MIN_BLOCK_Y; worldY -= 1) {
          const blockId = getBlockAt(worldX, worldY, worldZ)
          const index = this.getRegionIndex(region, worldX, worldY, worldZ)
          const emittedLight = getBlockEmittedLightLevel(blockId)
          if (emittedLight > 0) {
            blockLight[index] = emittedLight
            blockQueue.push(index)
          }

          if (skylightBlocked || !isLightPassable(blockId)) {
            skylightBlocked = true
            continue
          }

          skyLight[index] = LIGHT_LEVEL_MAX
          directSkyIndices.push(index)
        }
      }
    }

    this.seedSkyLightQueue(region, skyLight, directSkyIndices, skyQueue, getBlockAt)
    this.propagateSkyLight(skyLight, skyQueue, region, getBlockAt)
    this.propagateBlockLight(blockLight, blockQueue, region, getBlockAt)

    return region
  }

  private seedSkyLightQueue(
    region: LightRegion,
    channel: Uint8Array,
    directSkyIndices: readonly number[],
    queue: number[],
    getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
  ): void {
    for (const index of directSkyIndices) {
      const { x, y, z } = this.getRegionPosition(region, index)
      for (const [dx, , dz] of HORIZONTAL_LIGHT_DIRECTIONS) {
        const nextX = x + dx
        const nextZ = z + dz
        if (
          nextX < region.minChunkX * CHUNK_SIZE ||
          nextX >= region.minChunkX * CHUNK_SIZE + region.width ||
          nextZ < region.minChunkZ * CHUNK_SIZE ||
          nextZ >= region.minChunkZ * CHUNK_SIZE + region.depth
        ) {
          continue
        }

        if (!isLightPassable(getBlockAt(nextX, y, nextZ))) {
          continue
        }

        const nextIndex = this.getRegionIndex(region, nextX, y, nextZ)
        if ((channel[nextIndex] ?? 0) >= LIGHT_LEVEL_MAX - 1) {
          continue
        }

        channel[nextIndex] = LIGHT_LEVEL_MAX - 1
        queue.push(nextIndex)
      }
    }
  }

  private propagateSkyLight(
    channel: Uint8Array,
    queue: number[],
    region: LightRegion,
    getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
  ): void {
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const index = queue[queueIndex]!
      const lightLevel = channel[index] ?? 0
      if (lightLevel <= 1) {
        continue
      }

      const { x, y, z } = this.getRegionPosition(region, index)
      for (const [dx, dy, dz] of LIGHT_DIRECTIONS) {
        const nextX = x + dx
        const nextY = y + dy
        const nextZ = z + dz
        if (
          nextY < WORLD_MIN_BLOCK_Y ||
          nextY > WORLD_MAX_BLOCK_Y ||
          nextX < region.minChunkX * CHUNK_SIZE ||
          nextX >= region.minChunkX * CHUNK_SIZE + region.width ||
          nextZ < region.minChunkZ * CHUNK_SIZE ||
          nextZ >= region.minChunkZ * CHUNK_SIZE + region.depth
        ) {
          continue
        }

        if (!isLightPassable(getBlockAt(nextX, nextY, nextZ))) {
          continue
        }

        const nextIndex = this.getRegionIndex(region, nextX, nextY, nextZ)
        const nextLight = lightLevel - 1
        if (nextLight <= (channel[nextIndex] ?? 0)) {
          continue
        }

        channel[nextIndex] = nextLight
        queue.push(nextIndex)
      }
    }
  }

  private propagateBlockLight(
    channel: Uint8Array,
    queue: number[],
    region: LightRegion,
    getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
  ): void {
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const index = queue[queueIndex]!
      const lightLevel = channel[index] ?? 0
      if (lightLevel <= 1) {
        continue
      }

      const { x, y, z } = this.getRegionPosition(region, index)
      for (const [dx, dy, dz] of LIGHT_DIRECTIONS) {
        const nextX = x + dx
        const nextY = y + dy
        const nextZ = z + dz
        if (
          nextY < WORLD_MIN_BLOCK_Y ||
          nextY > WORLD_MAX_BLOCK_Y ||
          nextX < region.minChunkX * CHUNK_SIZE ||
          nextX >= region.minChunkX * CHUNK_SIZE + region.width ||
          nextZ < region.minChunkZ * CHUNK_SIZE ||
          nextZ >= region.minChunkZ * CHUNK_SIZE + region.depth
        ) {
          continue
        }

        if (!isLightPassable(getBlockAt(nextX, nextY, nextZ))) {
          continue
        }

        const nextIndex = this.getRegionIndex(region, nextX, nextY, nextZ)
        const nextLight = lightLevel - 1
        if (nextLight <= (channel[nextIndex] ?? 0)) {
          continue
        }

        channel[nextIndex] = nextLight
        queue.push(nextIndex)
      }
    }
  }

  private getRegionIndex(
    region: LightRegion,
    worldX: number,
    worldY: number,
    worldZ: number,
  ): number {
    const localX = worldX - region.minChunkX * CHUNK_SIZE
    const localY = worldY - WORLD_MIN_BLOCK_Y
    const localZ = worldZ - region.minChunkZ * CHUNK_SIZE
    return localX + region.width * (localZ + region.depth * localY)
  }

  private getRegionPosition(
    region: LightRegion,
    index: number,
  ): {
    x: number
    y: number
    z: number
  } {
    const plane = region.width * region.depth
    const localY = Math.floor(index / plane)
    const withinPlane = index - localY * plane
    const z = Math.floor(withinPlane / region.width)
    const x = withinPlane - z * region.width
    return {
      x: region.minChunkX * CHUNK_SIZE + x,
      y: WORLD_MIN_BLOCK_Y + localY,
      z: region.minChunkZ * CHUNK_SIZE + z,
    }
  }
}
