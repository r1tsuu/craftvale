import { loadBinaryAsset } from "../platform/native.ts";
import { decodePng } from "../platform/png.ts";

export const ATLAS_TILE_SIZE = 16;
export const ATLAS_COLUMNS = 4;
export const ATLAS_ROWS = 3;
export const ATLAS_WIDTH = ATLAS_TILE_SIZE * ATLAS_COLUMNS;
export const ATLAS_HEIGHT = ATLAS_TILE_SIZE * ATLAS_ROWS;
export const VOXEL_ATLAS_ASSET_PATH = "assets/textures/voxel-atlas.png";

export type AtlasTileId =
  | "grass-top"
  | "grass-side"
  | "dirt"
  | "stone"
  | "log-top"
  | "log-side"
  | "leaves"
  | "sand"
  | "planks"
  | "cobblestone"
  | "brick";

export interface AtlasTileCoord {
  x: number;
  y: number;
}

export interface AtlasUvRect {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

export const AtlasTiles: Record<AtlasTileId, AtlasTileCoord> = {
  "grass-top": { x: 0, y: 0 },
  "grass-side": { x: 1, y: 0 },
  "log-top": { x: 2, y: 0 },
  leaves: { x: 3, y: 0 },
  dirt: { x: 0, y: 1 },
  stone: { x: 1, y: 1 },
  "log-side": { x: 2, y: 1 },
  sand: { x: 3, y: 1 },
  planks: { x: 0, y: 2 },
  cobblestone: { x: 1, y: 2 },
  brick: { x: 2, y: 2 },
};

const UV_INSET_X = 0.5 / ATLAS_WIDTH;
const UV_INSET_Y = 0.5 / ATLAS_HEIGHT;
let cachedAtlasImageData:
  | {
      width: number;
      height: number;
      pixels: Uint8Array;
    }
  | null = null;

export const loadVoxelAtlasImageData = (): {
  width: number;
  height: number;
  pixels: Uint8Array;
} => {
  if (cachedAtlasImageData) {
    return cachedAtlasImageData;
  }

  const decoded = decodePng(loadBinaryAsset(VOXEL_ATLAS_ASSET_PATH));
  if (decoded.width !== ATLAS_WIDTH || decoded.height !== ATLAS_HEIGHT) {
    throw new Error(
      `Unexpected atlas dimensions ${decoded.width}x${decoded.height}; expected ${ATLAS_WIDTH}x${ATLAS_HEIGHT}.`,
    );
  }

  cachedAtlasImageData = decoded;
  return cachedAtlasImageData;
};

export const getAtlasUvRect = (tile: AtlasTileId): AtlasUvRect => {
  const coord = AtlasTiles[tile];
  const uMin = coord.x / ATLAS_COLUMNS + UV_INSET_X;
  const uMax = (coord.x + 1) / ATLAS_COLUMNS - UV_INSET_X;
  const vMin = coord.y / ATLAS_ROWS + UV_INSET_Y;
  const vMax = (coord.y + 1) / ATLAS_ROWS - UV_INSET_Y;

  return { uMin, uMax, vMin, vMax };
};
