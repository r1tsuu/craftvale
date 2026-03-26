import { loadBinaryAsset } from "../platform/native.ts";
import {
  ITEM_ICON_ATLAS_HEIGHT,
  ITEM_ICON_ATLAS_WIDTH,
  ITEM_ICON_IDS,
  ITEM_ICON_SIZE,
  decodePng,
  getItemIconUvRect,
  type ItemId,
  type ItemIconUvRect,
} from "@craftvale/core/shared";

export {
  ITEM_ICON_ATLAS_HEIGHT,
  ITEM_ICON_ATLAS_WIDTH,
  ITEM_ICON_IDS,
  ITEM_ICON_SIZE,
  getItemIconUvRect,
  type ItemId,
  type ItemIconUvRect,
};

export const ITEM_ICON_ATLAS_ASSET_PATH = "assets/textures/item-icons.png";

let cachedItemIconAtlasImageData:
  | {
      width: number;
      height: number;
      pixels: Uint8Array;
    }
  | null = null;

export const loadItemIconAtlasImageData = (): {
  width: number;
  height: number;
  pixels: Uint8Array;
} => {
  if (cachedItemIconAtlasImageData) {
    return cachedItemIconAtlasImageData;
  }

  const decoded = decodePng(loadBinaryAsset(ITEM_ICON_ATLAS_ASSET_PATH));
  if (decoded.width !== ITEM_ICON_ATLAS_WIDTH || decoded.height !== ITEM_ICON_ATLAS_HEIGHT) {
    throw new Error(
      `Unexpected item icon atlas dimensions ${decoded.width}x${decoded.height}; expected ${ITEM_ICON_ATLAS_WIDTH}x${ITEM_ICON_ATLAS_HEIGHT}.`,
    );
  }

  cachedItemIconAtlasImageData = decoded;
  return cachedItemIconAtlasImageData;
};
