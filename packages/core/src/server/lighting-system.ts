import type { BlockId, ChunkCoord } from '../types.ts'
import type { Chunk } from '../world/chunk.ts'

import {
  advanceWorldTime,
  cloneWorldTimeState,
  createDefaultWorldTimeState,
  normalizeWorldTimeState,
  type WorldTimeState,
} from '../shared/lighting.ts'
import { createNativeLightingBackend } from './native-lighting.ts'
import {
  type ChunkLightBuffers,
  createLightingChunkInputFromBlockResolver,
  createLightingChunkInputFromChunk,
  type LightingChunkInput,
} from './native-lighting.ts'

const BORDER_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

const chunkKey = ({ x, z }: ChunkCoord): string => `${x},${z}`

export class LightingSystem {
  private worldTime = createDefaultWorldTimeState()
  private readonly nativeLighting = createNativeLightingBackend()

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
    getChunkAt?: (coord: ChunkCoord) => Chunk | undefined,
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
    const inputs = new Map<string, LightingChunkInput>()
    const changedKeys = new Set<string>()
    for (const key of affectedKeys) {
      const chunk = loadedChunks.get(key)!
      buffers.set(key, {
        sky: chunk.cloneSkyLight(),
        block: chunk.cloneBlockLight(),
      })
      inputs.set(key, createLightingChunkInputFromChunk(chunk))
    }

    const externalInputs = new Map<string, LightingChunkInput>()
    const resolveNeighborInput = (coord: ChunkCoord): LightingChunkInput => {
      const key = chunkKey(coord)
      const loaded = inputs.get(key)
      if (loaded) {
        return loaded
      }

      const cached = externalInputs.get(key)
      if (cached) {
        return cached
      }

      const chunk = getChunkAt?.(coord)
      const resolved = chunk
        ? createLightingChunkInputFromChunk(chunk)
        : createLightingChunkInputFromBlockResolver(coord, getBlockAt)
      externalInputs.set(key, resolved)
      return resolved
    }

    for (const chunk of dirtyChunks) {
      const input = inputs.get(chunkKey(chunk.coord))!
      const working = buffers.get(chunkKey(chunk.coord))!
      working.sky.fill(0)
      working.block.fill(0)
      this.relightChunk(input, working)
      this.seedExternalBorderLight(input, working, {
        east: resolveNeighborInput({ x: chunk.coord.x + 1, z: chunk.coord.z }),
        west: resolveNeighborInput({ x: chunk.coord.x - 1, z: chunk.coord.z }),
        south: resolveNeighborInput({ x: chunk.coord.x, z: chunk.coord.z + 1 }),
        north: resolveNeighborInput({ x: chunk.coord.x, z: chunk.coord.z - 1 }),
      })
      changedKeys.add(chunkKey(chunk.coord))
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
      const leftInput = inputs.get(leftKey)
      const rightInput = inputs.get(rightKey)
      if (!leftBuffers || !rightBuffers || !leftInput || !rightInput) {
        continue
      }

      const changed = this.propagateBorderPair(
        leftInput,
        leftBuffers,
        rightInput,
        rightBuffers,
        right.coord.x - left.coord.x,
        right.coord.z - left.coord.z,
      )
      if (changed.left) {
        changedKeys.add(leftKey)
        enqueueChunkPairs(left.coord)
      }
      if (changed.right) {
        changedKeys.add(rightKey)
        enqueueChunkPairs(right.coord)
      }
    }

    const changedCoords: ChunkCoord[] = []
    for (const key of changedKeys) {
      const chunk = loadedChunks.get(key)!
      const working = buffers.get(key)!
      chunk.replaceLighting(working.sky, working.block)
      changedCoords.push(chunk.coord)
    }

    return changedCoords
  }

  public relightChunk(chunk: LightingChunkInput, buffers: ChunkLightBuffers): void {
    this.nativeLighting.relightChunk(chunk, buffers)
  }

  private seedExternalBorderLight(
    chunk: LightingChunkInput,
    buffers: ChunkLightBuffers,
    neighbors: {
      east: LightingChunkInput
      west: LightingChunkInput
      south: LightingChunkInput
      north: LightingChunkInput
    },
  ): void {
    this.nativeLighting.seedExternalBorderLight(chunk, buffers, neighbors)
  }

  private propagateBorderPair(
    left: LightingChunkInput,
    leftBuffers: ChunkLightBuffers,
    right: LightingChunkInput,
    rightBuffers: ChunkLightBuffers,
    deltaX: number,
    deltaZ: number,
  ): {
    left: boolean
    right: boolean
  } {
    return this.nativeLighting.propagateBorderPair(
      left,
      leftBuffers,
      right,
      rightBuffers,
      deltaX,
      deltaZ,
    )
  }
}
