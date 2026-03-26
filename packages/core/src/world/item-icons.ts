import type { ItemId } from "../types.ts";
import { ITEM_ID_VALUES } from "./generated/content-ids.ts";

export interface ItemIconAtlasCoord {
  x: number;
  y: number;
}

export interface ItemIconUvRect {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

export const ITEM_ICON_SIZE = 32;
export const ITEM_ICON_IDS = [...ITEM_ID_VALUES] as readonly ItemId[];
export const ITEM_ICON_ATLAS_COLUMNS = Math.max(1, Math.ceil(Math.sqrt(ITEM_ICON_IDS.length)));
export const ITEM_ICON_ATLAS_ROWS = Math.max(1, Math.ceil(ITEM_ICON_IDS.length / ITEM_ICON_ATLAS_COLUMNS));
export const ITEM_ICON_ATLAS_WIDTH = ITEM_ICON_ATLAS_COLUMNS * ITEM_ICON_SIZE;
export const ITEM_ICON_ATLAS_HEIGHT = ITEM_ICON_ATLAS_ROWS * ITEM_ICON_SIZE;

const UV_INSET_X = 0.5 / ITEM_ICON_ATLAS_WIDTH;
const UV_INSET_Y = 0.5 / ITEM_ICON_ATLAS_HEIGHT;
const ITEM_ICON_INDEX_BY_ID = new Map<ItemId, number>(
  ITEM_ICON_IDS.map((itemId, index) => [itemId, index] as const),
);

export const getItemIconAtlasCoord = (itemId: ItemId): ItemIconAtlasCoord => {
  const index = ITEM_ICON_INDEX_BY_ID.get(itemId);
  if (index === undefined) {
    throw new Error(`Missing icon atlas coordinate for item id ${itemId}.`);
  }

  return {
    x: index % ITEM_ICON_ATLAS_COLUMNS,
    y: Math.floor(index / ITEM_ICON_ATLAS_COLUMNS),
  };
};

export const getItemIconUvRect = (itemId: ItemId): ItemIconUvRect => {
  const coord = getItemIconAtlasCoord(itemId);
  const uMin = coord.x / ITEM_ICON_ATLAS_COLUMNS + UV_INSET_X;
  const uMax = (coord.x + 1) / ITEM_ICON_ATLAS_COLUMNS - UV_INSET_X;
  const vMin = coord.y / ITEM_ICON_ATLAS_ROWS + UV_INSET_Y;
  const vMax = (coord.y + 1) / ITEM_ICON_ATLAS_ROWS - UV_INSET_Y;

  return { uMin, uMax, vMin, vMax };
};
