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
import { CHUNK_HEIGHT, CHUNK_SIZE, WORLD_MAX_BLOCK_Y } from '../world/constants.ts'

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
const BORDER_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

interface ChunkLightBuffers {
  sky: Uint8Array
  block: Uint8Array
}

const chunkKey = ({ x, z }: ChunkCoord): string => `${x},${z}`

const isLightPassable = (blockId: BlockId): boolean => blockId === BLOCK_IDS.air

const localIndex = (localX: number, localY: number, localZ: number): number =>
  localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * localY)

const localPosition = (
  index: number,
): {
  x: number
  y: number
  z: number
} => {
  const plane = CHUNK_SIZE * CHUNK_SIZE
  const y = Math.floor(index / plane)
  const withinPlane = index - y * plane
  const z = Math.floor(withinPlane / CHUNK_SIZE)
  const x = withinPlane - z * CHUNK_SIZE
  return { x, y, z }
}

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

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

    const loadedChunks = new Map(chunks.map((chunk) => [chunkKey(chunk.coord), chunk]))
    const dirtyChunks = chunks.filter((chunk) => chunk.dirtyLight)
    if (dirtyChunks.length === 0) {
      return []
    }

    const affectedKeys = new Set<string>()
    for (const chunk of dirtyChunks) {
      affectedKeys.add(chunkKey(chunk.coord))
      for (const [dx, dz] of BORDER_DIRECTIONS) {
        const neighborKey = chunkKey({ x: chunk.coord.x + dx, z: chunk.coord.z + dz })
        if (loadedChunks.has(neighborKey)) {
          affectedKeys.add(neighborKey)
        }
      }
    }

    const buffers = new Map<string, ChunkLightBuffers>()
    for (const key of affectedKeys) {
      const chunk = loadedChunks.get(key)!
      buffers.set(key, {
        sky: chunk.cloneSkyLight(),
        block: chunk.cloneBlockLight(),
      })
    }

    for (const chunk of dirtyChunks) {
      const working = buffers.get(chunkKey(chunk.coord))!
      working.sky.fill(0)
      working.block.fill(0)
      this.relightChunk(chunk, working)
      this.seedExternalBorderLight(chunk, working, loadedChunks, getBlockAt)
    }

    const pendingPairs: Array<[string, string]> = []
    const queuedPairs = new Set<string>()
    const enqueueChunkPairs = (coord: ChunkCoord): void => {
      const key = chunkKey(coord)
      if (!affectedKeys.has(key)) {
        return
      }

      for (const [dx, dz] of BORDER_DIRECTIONS) {
        const neighbor = { x: coord.x + dx, z: coord.z + dz }
        const neighborKey = chunkKey(neighbor)
        if (!loadedChunks.has(neighborKey)) {
          continue
        }

        const pair = [key, neighborKey].sort() as [string, string]
        const pairKey = `${pair[0]}|${pair[1]}`
        if (queuedPairs.has(pairKey)) {
          continue
        }

        queuedPairs.add(pairKey)
        pendingPairs.push(pair)
      }
    }

    for (const chunk of dirtyChunks) {
      enqueueChunkPairs(chunk.coord)
    }

    while (pendingPairs.length > 0) {
      const [leftKey, rightKey] = pendingPairs.shift()!
      queuedPairs.delete(`${leftKey}|${rightKey}`)
      const left = loadedChunks.get(leftKey)
      const right = loadedChunks.get(rightKey)
      if (!left || !right) {
        continue
      }

      const leftBuffers = buffers.get(leftKey)
      const rightBuffers = buffers.get(rightKey)
      if (!leftBuffers || !rightBuffers) {
        continue
      }

      const changed = this.propagateBorderPair(left, leftBuffers, right, rightBuffers)
      if (changed.left) {
        enqueueChunkPairs(left.coord)
      }
      if (changed.right) {
        enqueueChunkPairs(right.coord)
      }
    }

    const changedCoords: ChunkCoord[] = []
    for (const key of affectedKeys) {
      const chunk = loadedChunks.get(key)!
      const working = buffers.get(key)!
      const skyChanged = !sameBytes(chunk.skyLight, working.sky)
      const blockChanged = !sameBytes(chunk.blockLight, working.block)
      if (skyChanged || blockChanged) {
        chunk.replaceLighting(working.sky, working.block)
        changedCoords.push(chunk.coord)
      } else {
        chunk.dirtyLight = false
      }
    }

    return changedCoords
  }

  public relightChunk(chunk: Chunk, buffers: ChunkLightBuffers): void {
    if (!chunk.dirtyLight) {
      return
    }

    const directSkyIndices: number[] = []
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const columnHeight = chunk.heightmap[localX + CHUNK_SIZE * localZ] ?? 0
        const startY =
          columnHeight === 0 && chunk.get(localX, 0, localZ) === BLOCK_IDS.air
            ? 0
            : Math.min(CHUNK_HEIGHT, columnHeight + 1)
        for (let localY = startY; localY < CHUNK_HEIGHT; localY += 1) {
          if (!isLightPassable(chunk.get(localX, localY, localZ))) {
            break
          }

          const index = localIndex(localX, localY, localZ)
          buffers.sky[index] = LIGHT_LEVEL_MAX
          directSkyIndices.push(index)
        }
      }
    }

    const skyQueue: number[] = []
    this.seedSkyQueue(chunk, buffers.sky, directSkyIndices, skyQueue)
    this.propagateSkyLightWithinChunk(chunk, buffers.sky, skyQueue)

    const blockQueue: number[] = []
    for (let subchunkY = 0; subchunkY < chunk.subchunks.length; subchunkY += 1) {
      const subchunk = chunk.subchunks[subchunkY]!
      if (subchunk.paletteIsAllAir || !subchunk.paletteHasEmitters) {
        continue
      }

      const baseY = subchunkY * 16
      for (let index = 0; index < subchunk.blocks.length; index += 1) {
        const paletteIndex = subchunk.blocks[index]!
        const blockId = subchunk.palette[paletteIndex] as BlockId
        const emittedLight = getBlockEmittedLightLevel(blockId)
        if (emittedLight <= 0) {
          continue
        }

        const localY = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE))
        const withinPlane = index - localY * CHUNK_SIZE * CHUNK_SIZE
        const localZ = Math.floor(withinPlane / CHUNK_SIZE)
        const localX = withinPlane - localZ * CHUNK_SIZE
        const worldIndex = localIndex(localX, baseY + localY, localZ)
        buffers.block[worldIndex] = emittedLight
        blockQueue.push(worldIndex)
      }
    }

    this.propagateBlockLightWithinChunk(chunk, buffers.block, blockQueue)
  }

  private seedSkyQueue(
    chunk: Chunk,
    channel: Uint8Array,
    directSkyIndices: readonly number[],
    queue: number[],
  ): void {
    for (const index of directSkyIndices) {
      const { x, y, z } = localPosition(index)
      for (const [dx, , dz] of HORIZONTAL_LIGHT_DIRECTIONS) {
        const nextX = x + dx
        const nextZ = z + dz
        if (nextX < 0 || nextX >= CHUNK_SIZE || nextZ < 0 || nextZ >= CHUNK_SIZE) {
          continue
        }

        if (!isLightPassable(chunk.get(nextX, y, nextZ))) {
          continue
        }

        const nextIndex = localIndex(nextX, y, nextZ)
        if ((channel[nextIndex] ?? 0) >= LIGHT_LEVEL_MAX - 1) {
          continue
        }

        channel[nextIndex] = LIGHT_LEVEL_MAX - 1
        queue.push(nextIndex)
      }
    }
  }

  private propagateSkyLightWithinChunk(
    chunk: Chunk,
    channel: Uint8Array,
    queue: number[],
  ): boolean {
    return this.propagateChannelWithinChunk(chunk, channel, queue, (blockId) =>
      isLightPassable(blockId),
    )
  }

  private propagateBlockLightWithinChunk(
    chunk: Chunk,
    channel: Uint8Array,
    queue: number[],
  ): boolean {
    return this.propagateChannelWithinChunk(chunk, channel, queue, (blockId) =>
      isLightPassable(blockId),
    )
  }

  private propagateChannelWithinChunk(
    chunk: Chunk,
    channel: Uint8Array,
    queue: number[],
    canReceive: (blockId: BlockId) => boolean,
  ): boolean {
    let changed = false

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const index = queue[queueIndex]!
      const lightLevel = channel[index] ?? 0
      if (lightLevel <= 1) {
        continue
      }

      const { x, y, z } = localPosition(index)
      for (const [dx, dy, dz] of LIGHT_DIRECTIONS) {
        const nextX = x + dx
        const nextY = y + dy
        const nextZ = z + dz
        if (
          nextX < 0 ||
          nextX >= CHUNK_SIZE ||
          nextY < 0 ||
          nextY >= CHUNK_HEIGHT ||
          nextZ < 0 ||
          nextZ >= CHUNK_SIZE
        ) {
          continue
        }

        if (!canReceive(chunk.get(nextX, nextY, nextZ))) {
          continue
        }

        const nextIndex = localIndex(nextX, nextY, nextZ)
        const nextLight = lightLevel - 1
        if (nextLight <= (channel[nextIndex] ?? 0)) {
          continue
        }

        channel[nextIndex] = nextLight
        queue.push(nextIndex)
        changed = true
      }
    }

    return changed
  }

  private seedExternalBorderLight(
    chunk: Chunk,
    buffers: ChunkLightBuffers,
    loadedChunks: ReadonlyMap<string, Chunk>,
    getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
  ): void {
    const skyQueue: number[] = []
    const blockQueue: number[] = []

    for (const [dx, dz] of BORDER_DIRECTIONS) {
      const neighborKey = chunkKey({ x: chunk.coord.x + dx, z: chunk.coord.z + dz })
      if (loadedChunks.has(neighborKey)) {
        continue
      }

      const localX = dx === 1 ? CHUNK_SIZE - 1 : dx === -1 ? 0 : null
      const localZ = dz === 1 ? CHUNK_SIZE - 1 : dz === -1 ? 0 : null

      for (let localY = 0; localY < CHUNK_HEIGHT; localY += 1) {
        for (let edge = 0; edge < CHUNK_SIZE; edge += 1) {
          const x = localX ?? edge
          const z = localZ ?? edge
          if (!isLightPassable(chunk.get(x, localY, z))) {
            continue
          }

          const worldX = chunk.coord.x * CHUNK_SIZE + x + dx
          const worldZ = chunk.coord.z * CHUNK_SIZE + z + dz
          const outsideBlock = getBlockAt(worldX, localY, worldZ)
          const insideIndex = localIndex(x, localY, z)

          if (isLightPassable(outsideBlock)) {
            const skyLight = this.getExternalDirectSkyLight(worldX, localY, worldZ, getBlockAt)
            if (skyLight > 1 && skyLight - 1 > (buffers.sky[insideIndex] ?? 0)) {
              buffers.sky[insideIndex] = skyLight - 1
              skyQueue.push(insideIndex)
            }
          }

          const emittedLight = getBlockEmittedLightLevel(outsideBlock)
          if (emittedLight > 1 && emittedLight - 1 > (buffers.block[insideIndex] ?? 0)) {
            buffers.block[insideIndex] = emittedLight - 1
            blockQueue.push(insideIndex)
          }
        }
      }
    }

    this.propagateSkyLightWithinChunk(chunk, buffers.sky, skyQueue)
    this.propagateBlockLightWithinChunk(chunk, buffers.block, blockQueue)
  }

  private getExternalDirectSkyLight(
    worldX: number,
    worldY: number,
    worldZ: number,
    getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
  ): number {
    for (let y = worldY; y <= WORLD_MAX_BLOCK_Y; y += 1) {
      if (!isLightPassable(getBlockAt(worldX, y, worldZ))) {
        return 0
      }
    }

    return LIGHT_LEVEL_MAX
  }

  private propagateBorderPair(
    left: Chunk,
    leftBuffers: ChunkLightBuffers,
    right: Chunk,
    rightBuffers: ChunkLightBuffers,
  ): {
    left: boolean
    right: boolean
  } {
    if (Math.abs(left.coord.x - right.coord.x) + Math.abs(left.coord.z - right.coord.z) !== 1) {
      return {
        left: false,
        right: false,
      }
    }

    const leftSkyQueue: number[] = []
    const rightSkyQueue: number[] = []
    const leftBlockQueue: number[] = []
    const rightBlockQueue: number[] = []

    const deltaX = right.coord.x - left.coord.x
    const deltaZ = right.coord.z - left.coord.z

    for (let localY = 0; localY < CHUNK_HEIGHT; localY += 1) {
      for (let edge = 0; edge < CHUNK_SIZE; edge += 1) {
        const leftX = deltaX === 1 ? CHUNK_SIZE - 1 : deltaX === -1 ? 0 : edge
        const rightX = deltaX === 1 ? 0 : deltaX === -1 ? CHUNK_SIZE - 1 : edge
        const leftZ = deltaZ === 1 ? CHUNK_SIZE - 1 : deltaZ === -1 ? 0 : edge
        const rightZ = deltaZ === 1 ? 0 : deltaZ === -1 ? CHUNK_SIZE - 1 : edge

        const leftIndex = localIndex(leftX, localY, leftZ)
        const rightIndex = localIndex(rightX, localY, rightZ)
        const leftBlockId = left.get(leftX, localY, leftZ)
        const rightBlockId = right.get(rightX, localY, rightZ)

        if (isLightPassable(leftBlockId) && isLightPassable(rightBlockId)) {
          const leftSky = leftBuffers.sky[leftIndex] ?? 0
          const rightSky = rightBuffers.sky[rightIndex] ?? 0
          if (leftSky > 1 && leftSky - 1 > rightSky) {
            rightBuffers.sky[rightIndex] = leftSky - 1
            rightSkyQueue.push(rightIndex)
          }
          if (rightSky > 1 && rightSky - 1 > leftSky) {
            leftBuffers.sky[leftIndex] = rightSky - 1
            leftSkyQueue.push(leftIndex)
          }
        }

        if (isLightPassable(rightBlockId)) {
          const leftBlockLight = leftBuffers.block[leftIndex] ?? 0
          if (leftBlockLight > 1 && leftBlockLight - 1 > (rightBuffers.block[rightIndex] ?? 0)) {
            rightBuffers.block[rightIndex] = leftBlockLight - 1
            rightBlockQueue.push(rightIndex)
          }
        }

        if (isLightPassable(leftBlockId)) {
          const rightBlockLight = rightBuffers.block[rightIndex] ?? 0
          if (rightBlockLight > 1 && rightBlockLight - 1 > (leftBuffers.block[leftIndex] ?? 0)) {
            leftBuffers.block[leftIndex] = rightBlockLight - 1
            leftBlockQueue.push(leftIndex)
          }
        }
      }
    }

    const leftSkyChanged = this.propagateSkyLightWithinChunk(left, leftBuffers.sky, leftSkyQueue)
    const rightSkyChanged = this.propagateSkyLightWithinChunk(
      right,
      rightBuffers.sky,
      rightSkyQueue,
    )
    const leftBlockChanged = this.propagateBlockLightWithinChunk(
      left,
      leftBuffers.block,
      leftBlockQueue,
    )
    const rightBlockChanged = this.propagateBlockLightWithinChunk(
      right,
      rightBuffers.block,
      rightBlockQueue,
    )

    return {
      left:
        leftSkyQueue.length > 0 || leftBlockQueue.length > 0 || leftSkyChanged || leftBlockChanged,
      right:
        rightSkyQueue.length > 0 ||
        rightBlockQueue.length > 0 ||
        rightSkyChanged ||
        rightBlockChanged,
    }
  }
}
