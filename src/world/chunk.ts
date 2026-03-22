import type { BlockId, ChunkCoord } from "../types.ts";
import { CHUNK_SIZE, CHUNK_VOLUME } from "./constants.ts";

export class Chunk {
  public readonly blocks = new Uint8Array(CHUNK_VOLUME);
  public dirty = true;

  public constructor(public readonly coord: ChunkCoord) {}

  public get(localX: number, localY: number, localZ: number): BlockId {
    return this.blocks[this.index(localX, localY, localZ)] as BlockId;
  }

  public set(localX: number, localY: number, localZ: number, blockId: BlockId): void {
    this.blocks[this.index(localX, localY, localZ)] = blockId;
    this.dirty = true;
  }

  private index(localX: number, localY: number, localZ: number): number {
    return localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * localY);
  }
}
