import type { BlockId } from "../types.ts";
import type { AtlasTileId } from "./atlas.ts";

export type BlockFaceRole = "top" | "bottom" | "side";
export type BlockOcclusionMode = "none" | "full" | "self";
export type BlockRenderPass = "opaque" | "cutout";

export interface BlockTiles {
  top: AtlasTileId;
  bottom: AtlasTileId;
  side: AtlasTileId;
}

export interface BlockDefinition {
  id: BlockId;
  name: string;
  collidable: boolean;
  occlusion: BlockOcclusionMode;
  renderPass: BlockRenderPass | null;
  color: [number, number, number];
  tiles?: BlockTiles;
}

export const Blocks: Record<BlockId, BlockDefinition> = {
  0: {
    id: 0,
    name: "air",
    collidable: false,
    occlusion: "none",
    renderPass: null,
    color: [0, 0, 0],
  },
  1: {
    id: 1,
    name: "grass",
    collidable: true,
    occlusion: "full",
    renderPass: "opaque",
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
    collidable: true,
    occlusion: "full",
    renderPass: "opaque",
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
    collidable: true,
    occlusion: "full",
    renderPass: "opaque",
    color: [0.5, 0.5, 0.56],
    tiles: {
      top: "stone",
      bottom: "stone",
      side: "stone",
    },
  },
  4: {
    id: 4,
    name: "log",
    collidable: true,
    occlusion: "full",
    renderPass: "opaque",
    color: [0.48, 0.37, 0.24],
    tiles: {
      top: "log-top",
      bottom: "log-top",
      side: "log-side",
    },
  },
  5: {
    id: 5,
    name: "leaves",
    collidable: true,
    occlusion: "self",
    renderPass: "cutout",
    color: [0.32, 0.58, 0.22],
    tiles: {
      top: "leaves",
      bottom: "leaves",
      side: "leaves",
    },
  },
};

export const isSolidBlock = (blockId: BlockId): boolean => Blocks[blockId].collidable;

export const getBlockRenderPass = (blockId: BlockId): BlockRenderPass | null =>
  Blocks[blockId].renderPass;

export const doesBlockOccludeNeighborFace = (
  blockId: BlockId,
  neighborId: BlockId,
): boolean => {
  const neighbor = Blocks[neighborId];
  if (neighbor.occlusion === "none") {
    return false;
  }

  if (neighbor.occlusion === "full") {
    return true;
  }

  return blockId === neighborId;
};

export const getBlockFaceTile = (
  blockId: BlockId,
  face: BlockFaceRole,
): AtlasTileId | null => {
  const tiles = Blocks[blockId].tiles;
  return tiles ? tiles[face] : null;
};
