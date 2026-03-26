import type { BlockId, ChunkCoord } from '../types.ts'

import { getBlockEmittedLightLevel } from './blocks.ts'
import {
  CHUNK_COLUMN_AREA,
  CHUNK_SIZE,
  CHUNK_SUBCHUNK_COUNT,
  CHUNK_SUBCHUNK_HEIGHT,
  CHUNK_SUBCHUNK_VOLUME,
  CHUNK_VOLUME,
} from './constants.ts'

const AIR_BLOCK_ID = 0 as BlockId

const getColumnIndex = (localX: number, localZ: number): number => localX + CHUNK_SIZE * localZ

const blockIndex = (localX: number, localY: number, localZ: number): number =>
  localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * localY)

const subChunkIndex = (localY: number): number => Math.floor(localY / CHUNK_SUBCHUNK_HEIGHT)

const subChunkBlockIndex = (localX: number, localYWithinSubchunk: number, localZ: number): number =>
  localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * localYWithinSubchunk)

export class SubChunk {
  public palette = new Uint16Array([AIR_BLOCK_ID])
  public paletteHasEmitters = false
  public paletteIsAllAir = true
  public readonly blocks = new Uint8Array(CHUNK_SUBCHUNK_VOLUME)
}

export class Chunk {
  public readonly blocks = new Uint8Array(CHUNK_VOLUME)
  public readonly skyLight = new Uint8Array(CHUNK_VOLUME)
  public readonly blockLight = new Uint8Array(CHUNK_VOLUME)
  public readonly heightmap = new Uint16Array(CHUNK_COLUMN_AREA)
  public readonly subchunks = Array.from({ length: CHUNK_SUBCHUNK_COUNT }, () => new SubChunk())
  public dirty = true
  public dirtyLight = true
  public revision = 0

  public constructor(public readonly coord: ChunkCoord) {
    this.rebuildDerivedData()
  }

  public get(localX: number, localY: number, localZ: number): BlockId {
    return this.blocks[this.index(localX, localY, localZ)] as BlockId
  }

  public set(localX: number, localY: number, localZ: number, blockId: BlockId): void {
    const index = this.index(localX, localY, localZ)
    const previous = this.blocks[index] as BlockId
    if (previous === blockId) {
      return
    }

    this.blocks[index] = blockId
    this.updateHeightmapColumn(localX, localY, localZ, previous, blockId)
    this.rebuildSubChunk(subChunkIndex(localY))
    this.dirty = true
    this.dirtyLight = true
  }

  public setFast(localX: number, localY: number, localZ: number, blockId: BlockId): void {
    this.blocks[this.index(localX, localY, localZ)] = blockId
    this.dirty = true
    this.dirtyLight = true
  }

  public replace(
    blocks: Uint8Array,
    revision = this.revision,
    skyLight?: Uint8Array,
    blockLight?: Uint8Array,
  ): void {
    if (blocks.length !== this.blocks.length) {
      throw new Error(
        `Invalid chunk buffer length ${blocks.length}; expected ${this.blocks.length}.`,
      )
    }

    this.blocks.set(blocks)
    if (skyLight) {
      if (skyLight.length !== this.skyLight.length) {
        throw new Error(
          `Invalid skylight buffer length ${skyLight.length}; expected ${this.skyLight.length}.`,
        )
      }
      this.skyLight.set(skyLight)
    } else {
      this.skyLight.fill(0)
    }

    if (blockLight) {
      if (blockLight.length !== this.blockLight.length) {
        throw new Error(
          `Invalid block-light buffer length ${blockLight.length}; expected ${this.blockLight.length}.`,
        )
      }
      this.blockLight.set(blockLight)
    } else {
      this.blockLight.fill(0)
    }

    this.revision = revision
    this.dirty = true
    this.dirtyLight = !(skyLight && blockLight)
    this.rebuildDerivedData()
  }

  public cloneBlocks(): Uint8Array {
    return new Uint8Array(this.blocks)
  }

  public cloneSkyLight(): Uint8Array {
    return new Uint8Array(this.skyLight)
  }

  public cloneBlockLight(): Uint8Array {
    return new Uint8Array(this.blockLight)
  }

  public getSkyLight(localX: number, localY: number, localZ: number): number {
    return this.skyLight[this.index(localX, localY, localZ)] ?? 0
  }

  public getBlockLight(localX: number, localY: number, localZ: number): number {
    return this.blockLight[this.index(localX, localY, localZ)] ?? 0
  }

  public replaceLighting(skyLight: Uint8Array, blockLight: Uint8Array): void {
    if (skyLight.length !== this.skyLight.length || blockLight.length !== this.blockLight.length) {
      throw new Error('Invalid chunk lighting buffer length.')
    }

    this.skyLight.set(skyLight)
    this.blockLight.set(blockLight)
    this.dirty = true
    this.dirtyLight = false
  }

  public setLighting(
    localX: number,
    localY: number,
    localZ: number,
    skyLight: number,
    blockLight: number,
  ): void {
    const index = this.index(localX, localY, localZ)
    this.skyLight[index] = Math.max(0, Math.min(15, Math.trunc(skyLight)))
    this.blockLight[index] = Math.max(0, Math.min(15, Math.trunc(blockLight)))
    this.dirty = true
  }

  public rebuildDerivedData(): void {
    this.rebuildHeightmap()
    for (let subchunk = 0; subchunk < this.subchunks.length; subchunk += 1) {
      this.rebuildSubChunk(subchunk)
    }
  }

  private rebuildHeightmap(): void {
    this.heightmap.fill(0)
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        let highestOpaque = 0
        for (
          let localY = CHUNK_SUBCHUNK_COUNT * CHUNK_SUBCHUNK_HEIGHT - 1;
          localY >= 0;
          localY -= 1
        ) {
          if ((this.blocks[this.index(localX, localY, localZ)] as BlockId) === AIR_BLOCK_ID) {
            continue
          }

          highestOpaque = localY
          break
        }

        this.heightmap[getColumnIndex(localX, localZ)] = highestOpaque
      }
    }
  }

  private updateHeightmapColumn(
    localX: number,
    localY: number,
    localZ: number,
    previous: BlockId,
    next: BlockId,
  ): void {
    const columnIndex = getColumnIndex(localX, localZ)
    const currentHighest = this.heightmap[columnIndex] ?? 0

    if (next !== AIR_BLOCK_ID && localY >= currentHighest) {
      this.heightmap[columnIndex] = localY
      return
    }

    if (previous === AIR_BLOCK_ID || localY !== currentHighest || next !== AIR_BLOCK_ID) {
      return
    }

    for (let scanY = localY - 1; scanY >= 0; scanY -= 1) {
      if ((this.blocks[this.index(localX, scanY, localZ)] as BlockId) === AIR_BLOCK_ID) {
        continue
      }

      this.heightmap[columnIndex] = scanY
      return
    }

    this.heightmap[columnIndex] = 0
  }

  private rebuildSubChunk(subchunkY: number): void {
    const subchunk = this.subchunks[subchunkY]!
    const paletteValues: number[] = []
    const paletteIndexes = new Map<number, number>()
    let hasEmitters = false
    let isAllAir = true

    const baseY = subchunkY * CHUNK_SUBCHUNK_HEIGHT
    for (let localY = 0; localY < CHUNK_SUBCHUNK_HEIGHT; localY += 1) {
      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
          const blockId = this.blocks[this.index(localX, baseY + localY, localZ)] as BlockId
          let paletteIndex = paletteIndexes.get(blockId)
          if (paletteIndex === undefined) {
            paletteIndex = paletteValues.length
            paletteValues.push(blockId)
            paletteIndexes.set(blockId, paletteIndex)
          }

          subchunk.blocks[subChunkBlockIndex(localX, localY, localZ)] = paletteIndex
          if (blockId !== AIR_BLOCK_ID) {
            isAllAir = false
          }
          if (getBlockEmittedLightLevel(blockId) > 0) {
            hasEmitters = true
          }
        }
      }
    }

    subchunk.palette = new Uint16Array(paletteValues)
    subchunk.paletteHasEmitters = hasEmitters
    subchunk.paletteIsAllAir = isAllAir
  }

  private index(localX: number, localY: number, localZ: number): number {
    return blockIndex(localX, localY, localZ)
  }
}
