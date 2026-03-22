import type { BlockId } from "../types.ts";

export interface BlockDefinition {
  id: BlockId;
  name: string;
  solid: boolean;
  color: [number, number, number];
}

export const Blocks: Record<BlockId, BlockDefinition> = {
  0: { id: 0, name: "air", solid: false, color: [0, 0, 0] },
  1: { id: 1, name: "grass", solid: true, color: [0.42, 0.71, 0.31] },
  2: { id: 2, name: "dirt", solid: true, color: [0.48, 0.34, 0.2] },
  3: { id: 3, name: "stone", solid: true, color: [0.5, 0.5, 0.56] },
};

export const isSolidBlock = (blockId: BlockId): boolean => Blocks[blockId].solid;
