import type { BlockId } from "../types.ts";
import type { AtlasTileId } from "./atlas.ts";

export type BlockFaceRole = "top" | "bottom" | "side";

export interface BlockTiles {
  top: AtlasTileId;
  bottom: AtlasTileId;
  side: AtlasTileId;
}

export interface BlockDefinition {
  id: BlockId;
  name: string;
  solid: boolean;
  color: [number, number, number];
  tiles?: BlockTiles;
}

export const Blocks: Record<BlockId, BlockDefinition> = {
  0: { id: 0, name: "air", solid: false, color: [0, 0, 0] },
  1: {
    id: 1,
    name: "grass",
    solid: true,
    color: [0.42, 0.71, 0.31],
    tiles: {
      top: "grass-top",
      bottom: "dirt",
      side: "grass-side",
    },
  },
  2: {
    id: 2,
    name: "dirt",
    solid: true,
    color: [0.48, 0.34, 0.2],
    tiles: {
      top: "dirt",
      bottom: "dirt",
      side: "dirt",
    },
  },
  3: {
    id: 3,
    name: "stone",
    solid: true,
    color: [0.5, 0.5, 0.56],
    tiles: {
      top: "stone",
      bottom: "stone",
      side: "stone",
    },
  },
};

export const isSolidBlock = (blockId: BlockId): boolean => Blocks[blockId].solid;

export const getBlockFaceTile = (
  blockId: BlockId,
  face: BlockFaceRole,
): AtlasTileId | null => {
  const tiles = Blocks[blockId].tiles;
  return tiles ? tiles[face] : null;
};
