import type { BlockId, ChunkCoord, LocalBlockCoord } from '../types.ts'

import { BLOCK_IDS } from './blocks.ts'
import { Chunk } from './chunk.ts'
import { CHUNK_SIZE, isWithinWorldBlockY } from './constants.ts'

const chunkKey = ({ x, z }: ChunkCoord): string => `${x},${z}`

const floorDiv = (value: number, size: number): number => Math.floor(value / size)
const mod = (value: number, size: number): number => ((value % size) + size) % size

export const worldToChunkCoord = (
  x: number,
  y: number,
  z: number,
): { chunk: ChunkCoord; local: LocalBlockCoord } => {
  const chunk = {
    x: floorDiv(x, CHUNK_SIZE),
    z: floorDiv(z, CHUNK_SIZE),
  }

  return {
    chunk,
    local: {
      x: mod(x, CHUNK_SIZE),
      y,
      z: mod(z, CHUNK_SIZE),
    },
  }
}

export class VoxelWorld {
  private readonly chunks = new Map<string, Chunk>()

  public ensureChunk(coord: ChunkCoord): Chunk {
    const key = chunkKey(coord)
    const existing = this.chunks.get(key)
    if (existing) {
      return existing
    }

    const chunk = new Chunk(coord)
    this.chunks.set(key, chunk)
    return chunk
  }

  public getChunk(coord: ChunkCoord): Chunk | undefined {
    return this.chunks.get(chunkKey(coord))
  }

  public hasChunk(coord: ChunkCoord): boolean {
    return this.chunks.has(chunkKey(coord))
  }

  public getBlock(worldX: number, worldY: number, worldZ: number): BlockId {
    if (!isWithinWorldBlockY(worldY)) {
      return BLOCK_IDS.air
    }

    const coords = worldToChunkCoord(worldX, worldY, worldZ)
    const chunk = this.getChunk(coords.chunk)
    return chunk ? chunk.get(coords.local.x, coords.local.y, coords.local.z) : BLOCK_IDS.air
  }

  public getSkyLight(worldX: number, worldY: number, worldZ: number): number {
    if (!isWithinWorldBlockY(worldY)) {
      return 0
    }

    const coords = worldToChunkCoord(worldX, worldY, worldZ)
    const chunk = this.getChunk(coords.chunk)
    return chunk ? chunk.getSkyLight(coords.local.x, coords.local.y, coords.local.z) : 0
  }

  public getBlockLight(worldX: number, worldY: number, worldZ: number): number {
    if (!isWithinWorldBlockY(worldY)) {
      return 0
    }

    const coords = worldToChunkCoord(worldX, worldY, worldZ)
    const chunk = this.getChunk(coords.chunk)
    return chunk ? chunk.getBlockLight(coords.local.x, coords.local.y, coords.local.z) : 0
  }

  public setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId): void {
    if (!isWithinWorldBlockY(worldY)) {
      return
    }

    const coords = worldToChunkCoord(worldX, worldY, worldZ)
    const chunk = this.ensureChunk(coords.chunk)
    chunk.set(coords.local.x, coords.local.y, coords.local.z, blockId)
    this.markNeighborBoundaries(coords.chunk, coords.local)
  }

  public setLighting(
    worldX: number,
    worldY: number,
    worldZ: number,
    skyLight: number,
    blockLight: number,
  ): boolean {
    if (!isWithinWorldBlockY(worldY)) {
      return false
    }

    const coords = worldToChunkCoord(worldX, worldY, worldZ)
    const chunk = this.getChunk(coords.chunk)
    if (!chunk) {
      return false
    }

    chunk.setLighting(coords.local.x, coords.local.y, coords.local.z, skyLight, blockLight)
    this.markNeighborBoundaries(coords.chunk, coords.local)
    return true
  }

  public replaceChunk(
    coord: ChunkCoord,
    blocks: Uint8Array,
    revision = 0,
    skyLight?: Uint8Array,
    blockLight?: Uint8Array,
  ): Chunk {
    const chunk = this.ensureChunk(coord)
    chunk.replace(blocks, revision, skyLight, blockLight)
    this.markAdjacentChunksDirty(coord)
    return chunk
  }

  public ensureActiveArea(centerChunkX: number, centerChunkZ: number, radius: number): void {
    for (let chunkZ = centerChunkZ - radius; chunkZ <= centerChunkZ + radius; chunkZ += 1) {
      for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1) {
        this.ensureChunk({ x: chunkX, z: chunkZ })
      }
    }
  }

  public getLoadedChunkCoords(): ChunkCoord[] {
    return [...this.chunks.values()].map((chunk) => chunk.coord)
  }

  public clear(): void {
    this.chunks.clear()
  }

  private markNeighborBoundaries(chunk: ChunkCoord, local: LocalBlockCoord): void {
    const maybeDirty = (x: number, z: number): void => {
      const target = this.getChunk({ x, z })
      if (target) {
        target.dirty = true
      }
    }

    if (local.x === 0) maybeDirty(chunk.x - 1, chunk.z)
    if (local.x === CHUNK_SIZE - 1) maybeDirty(chunk.x + 1, chunk.z)
    if (local.z === 0) maybeDirty(chunk.x, chunk.z - 1)
    if (local.z === CHUNK_SIZE - 1) maybeDirty(chunk.x, chunk.z + 1)
  }

  private markAdjacentChunksDirty(chunk: ChunkCoord): void {
    const maybeDirty = (x: number, z: number): void => {
      const target = this.getChunk({ x, z })
      if (target) {
        target.dirty = true
      }
    }

    maybeDirty(chunk.x - 1, chunk.z)
    maybeDirty(chunk.x + 1, chunk.z)
    maybeDirty(chunk.x, chunk.z - 1)
    maybeDirty(chunk.x, chunk.z + 1)
  }
}
