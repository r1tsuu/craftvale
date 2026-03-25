import type { BlockId, ItemId } from "../types.ts";
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
  breakable: boolean;
  occlusion: BlockOcclusionMode;
  renderPass: BlockRenderPass | null;
  dropItemId: ItemId | null;
  emittedLightLevel: number;
  color: [number, number, number];
  tiles?: BlockTiles;
}

export const Blocks: Record<BlockId, BlockDefinition> = {
  0: {
    id: 0,
    name: "air",
    collidable: false,
    breakable: false,
    occlusion: "none",
    renderPass: null,
    dropItemId: null,
    emittedLightLevel: 0,
    color: [0, 0, 0],
  },
  1: {
    id: 1,
    name: "grass",
    collidable: true,
    breakable: true,
    occlusion: "full",
    renderPass: "opaque",
    dropItemId: 101,
    emittedLightLevel: 0,
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
    breakable: true,
    occlusion: "full",
    renderPass: "opaque",
    dropItemId: 102,
    emittedLightLevel: 0,
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
    breakable: true,
    occlusion: "full",
    renderPass: "opaque",
    dropItemId: 103,
    emittedLightLevel: 0,
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
    breakable: true,
    occlusion: "full",
    renderPass: "opaque",
    dropItemId: 104,
    emittedLightLevel: 0,
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
    breakable: true,
    occlusion: "self",
    renderPass: "cutout",
    dropItemId: 105,
    emittedLightLevel: 0,
    color: [0.32, 0.58, 0.22],
    tiles: {
      top: "leaves",
      bottom: "leaves",
      side: "leaves",
    },
  },
  6: {
    id: 6,
    name: "sand",
    collidable: true,
    breakable: true,
    occlusion: "full",
    renderPass: "opaque",
    dropItemId: 106,
    emittedLightLevel: 0,
    color: [0.84, 0.78, 0.52],
    tiles: {
      top: "sand",
      bottom: "sand",
      side: "sand",
    },
  },
  7: {
    id: 7,
    name: "planks",
    collidable: true,
    breakable: true,
    occlusion: "full",
    renderPass: "opaque",
    dropItemId: 107,
    emittedLightLevel: 0,
    color: [0.72, 0.55, 0.31],
    tiles: {
      top: "planks",
      bottom: "planks",
      side: "planks",
    },
  },
  8: {
    id: 8,
    name: "cobblestone",
    collidable: true,
    breakable: true,
    occlusion: "full",
    renderPass: "opaque",
    dropItemId: 108,
    emittedLightLevel: 0,
    color: [0.58, 0.58, 0.61],
    tiles: {
      top: "cobblestone",
      bottom: "cobblestone",
      side: "cobblestone",
    },
  },
  9: {
    id: 9,
    name: "brick",
    collidable: true,
    breakable: true,
    occlusion: "full",
    renderPass: "opaque",
    dropItemId: 109,
    emittedLightLevel: 0,
    color: [0.69, 0.27, 0.22],
    tiles: {
      top: "brick",
      bottom: "brick",
      side: "brick",
    },
  },
  10: {
    id: 10,
    name: "bedrock",
    collidable: true,
    breakable: false,
    occlusion: "full",
    renderPass: "opaque",
    dropItemId: null,
    emittedLightLevel: 0,
    color: [0.24, 0.24, 0.27],
    tiles: {
      top: "bedrock",
      bottom: "bedrock",
      side: "bedrock",
    },
  },
  11: {
    id: 11,
    name: "glowstone",
    collidable: true,
    breakable: true,
    occlusion: "full",
    renderPass: "opaque",
    dropItemId: 110,
    emittedLightLevel: 15,
    color: [0.94, 0.79, 0.37],
    tiles: {
      top: "glowstone",
      bottom: "glowstone",
      side: "glowstone",
    },
  },
};

export const isSolidBlock = (blockId: BlockId): boolean => Blocks[blockId].collidable;

export const isBreakableBlock = (blockId: BlockId): boolean => Blocks[blockId].breakable;

export const getDroppedItemIdForBlock = (blockId: BlockId): ItemId | null => Blocks[blockId].dropItemId;

export const getBlockEmittedLightLevel = (blockId: BlockId): number =>
  Blocks[blockId].emittedLightLevel;

export const isCollectibleBlock = (blockId: BlockId): boolean => getDroppedItemIdForBlock(blockId) !== null;

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
