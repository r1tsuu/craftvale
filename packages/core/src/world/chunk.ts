import type { BlockId, ChunkCoord } from "../types.ts";
import { CHUNK_SIZE, CHUNK_VOLUME } from "./constants.ts";

export class Chunk {
  public readonly blocks = new Uint8Array(CHUNK_VOLUME);
  public readonly skyLight = new Uint8Array(CHUNK_VOLUME);
  public readonly blockLight = new Uint8Array(CHUNK_VOLUME);
  public dirty = true;
  public revision = 0;

  public constructor(public readonly coord: ChunkCoord) {}

  public get(localX: number, localY: number, localZ: number): BlockId {
    return this.blocks[this.index(localX, localY, localZ)] as BlockId;
  }

  public set(localX: number, localY: number, localZ: number, blockId: BlockId): void {
    this.blocks[this.index(localX, localY, localZ)] = blockId;
    this.dirty = true;
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
      );
    }

    this.blocks.set(blocks);
    if (skyLight) {
      if (skyLight.length !== this.skyLight.length) {
        throw new Error(
          `Invalid skylight buffer length ${skyLight.length}; expected ${this.skyLight.length}.`,
        );
      }
      this.skyLight.set(skyLight);
    } else {
      this.skyLight.fill(0);
    }

    if (blockLight) {
      if (blockLight.length !== this.blockLight.length) {
        throw new Error(
          `Invalid block-light buffer length ${blockLight.length}; expected ${this.blockLight.length}.`,
        );
      }
      this.blockLight.set(blockLight);
    } else {
      this.blockLight.fill(0);
    }

    this.revision = revision;
    this.dirty = true;
  }

  public cloneBlocks(): Uint8Array {
    return new Uint8Array(this.blocks);
  }

  public cloneSkyLight(): Uint8Array {
    return new Uint8Array(this.skyLight);
  }

  public cloneBlockLight(): Uint8Array {
    return new Uint8Array(this.blockLight);
  }

  public getSkyLight(localX: number, localY: number, localZ: number): number {
    return this.skyLight[this.index(localX, localY, localZ)] ?? 0;
  }

  public getBlockLight(localX: number, localY: number, localZ: number): number {
    return this.blockLight[this.index(localX, localY, localZ)] ?? 0;
  }

  public replaceLighting(skyLight: Uint8Array, blockLight: Uint8Array): void {
    if (skyLight.length !== this.skyLight.length || blockLight.length !== this.blockLight.length) {
      throw new Error("Invalid chunk lighting buffer length.");
    }

    this.skyLight.set(skyLight);
    this.blockLight.set(blockLight);
    this.dirty = true;
  }

  private index(localX: number, localY: number, localZ: number): number {
    return localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * localY);
  }
}
