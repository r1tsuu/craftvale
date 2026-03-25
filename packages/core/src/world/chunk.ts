import type { BlockId, ChunkCoord } from "../types.ts";
import { CHUNK_SIZE, CHUNK_VOLUME } from "./constants.ts";

export class Chunk {
  public readonly blocks = new Uint8Array(CHUNK_VOLUME);
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

  public replace(blocks: Uint8Array, revision = this.revision): void {
    if (blocks.length !== this.blocks.length) {
      throw new Error(
        `Invalid chunk buffer length ${blocks.length}; expected ${this.blocks.length}.`,
      );
    }

    this.blocks.set(blocks);
    this.revision = revision;
    this.dirty = true;
  }

  public cloneBlocks(): Uint8Array {
    return new Uint8Array(this.blocks);
  }

  private index(localX: number, localY: number, localZ: number): number {
    return localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * localY);
  }
}
