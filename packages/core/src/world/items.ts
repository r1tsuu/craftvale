import type { BlockId } from "../types.ts";
import type { ItemId } from "../types.ts";

export interface ItemDefinition {
  id: ItemId;
  name: string;
  color: [number, number, number];
  maxStackSize: number;
  placesBlockId: BlockId | null;
  renderBlockId: BlockId | null;
}

export const Items: Record<ItemId, ItemDefinition> = {
  0: {
    id: 0,
    name: "empty",
    color: [0, 0, 0],
    maxStackSize: 0,
    placesBlockId: null,
    renderBlockId: null,
  },
  101: {
    id: 101,
    name: "grass block",
    color: [0.42, 0.71, 0.31],
    maxStackSize: 64,
    placesBlockId: 1,
    renderBlockId: 1,
  },
  102: {
    id: 102,
    name: "dirt",
    color: [0.48, 0.34, 0.2],
    maxStackSize: 64,
    placesBlockId: 2,
    renderBlockId: 2,
  },
  103: {
    id: 103,
    name: "stone",
    color: [0.5, 0.5, 0.56],
    maxStackSize: 64,
    placesBlockId: 3,
    renderBlockId: 3,
  },
  104: {
    id: 104,
    name: "log",
    color: [0.48, 0.37, 0.24],
    maxStackSize: 64,
    placesBlockId: 4,
    renderBlockId: 4,
  },
  105: {
    id: 105,
    name: "leaves",
    color: [0.32, 0.58, 0.22],
    maxStackSize: 64,
    placesBlockId: 5,
    renderBlockId: 5,
  },
  106: {
    id: 106,
    name: "sand",
    color: [0.84, 0.78, 0.52],
    maxStackSize: 64,
    placesBlockId: 6,
    renderBlockId: 6,
  },
  107: {
    id: 107,
    name: "planks",
    color: [0.72, 0.55, 0.31],
    maxStackSize: 64,
    placesBlockId: 7,
    renderBlockId: 7,
  },
  108: {
    id: 108,
    name: "cobblestone",
    color: [0.58, 0.58, 0.61],
    maxStackSize: 64,
    placesBlockId: 8,
    renderBlockId: 8,
  },
  109: {
    id: 109,
    name: "brick",
    color: [0.69, 0.27, 0.22],
    maxStackSize: 64,
    placesBlockId: 9,
    renderBlockId: 9,
  },
  110: {
    id: 110,
    name: "glowstone",
    color: [0.94, 0.79, 0.37],
    maxStackSize: 64,
    placesBlockId: 11,
    renderBlockId: 11,
  },
};

export const HOTBAR_ITEM_IDS = [
  101,
  102,
  103,
  104,
  105,
  106,
  107,
  108,
  109,
] as const satisfies readonly ItemId[];

export const isValidItemId = (itemId: number): itemId is ItemId =>
  Number.isInteger(itemId) &&
  (itemId === 0 || (itemId >= 101 && itemId <= 110));

export const getItemDefinition = (itemId: ItemId): ItemDefinition => Items[itemId];

export const getItemDisplayName = (itemId: ItemId): string => Items[itemId].name;

export const getItemColor = (itemId: ItemId): [number, number, number] => Items[itemId].color;

export const getItemMaxStackSize = (itemId: ItemId): number => Items[itemId].maxStackSize;

export const getPlacedBlockIdForItem = (itemId: ItemId): BlockId | null => Items[itemId].placesBlockId;

export const getItemRenderBlockId = (itemId: ItemId): BlockId | null => Items[itemId].renderBlockId;

export const isPlaceableItem = (itemId: ItemId): boolean => Items[itemId].placesBlockId !== null;
