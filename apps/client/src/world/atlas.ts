import {
  ATLAS_COLUMNS,
  ATLAS_HEIGHT,
  ATLAS_ROWS,
  ATLAS_TILE_IDS,
  ATLAS_TILE_SIZE,
  ATLAS_WIDTH,
  type AtlasTileCoord,
  type AtlasTileId,
  AtlasTiles,
  type AtlasUvRect,
  decodePng,
  getAtlasUvRect,
} from '@craftvale/core/shared'

import { loadBinaryAsset } from '../platform/native.ts'
export {
  ATLAS_COLUMNS,
  ATLAS_HEIGHT,
  ATLAS_TILE_IDS,
  ATLAS_ROWS,
  ATLAS_TILE_SIZE,
  ATLAS_WIDTH,
  AtlasTiles,
  getAtlasUvRect,
  type AtlasTileCoord,
  type AtlasTileId,
  type AtlasUvRect,
}

export const VOXEL_ATLAS_ASSET_PATH = 'assets/textures/voxel-atlas.png'

let cachedAtlasImageData: {
  width: number
  height: number
  pixels: Uint8Array
} | null = null

export const loadVoxelAtlasImageData = (): {
  width: number
  height: number
  pixels: Uint8Array
} => {
  if (cachedAtlasImageData) {
    return cachedAtlasImageData
  }

  const decoded = decodePng(loadBinaryAsset(VOXEL_ATLAS_ASSET_PATH))
  if (decoded.width !== ATLAS_WIDTH || decoded.height !== ATLAS_HEIGHT) {
    throw new Error(
      `Unexpected atlas dimensions ${decoded.width}x${decoded.height}; expected ${ATLAS_WIDTH}x${ATLAS_HEIGHT}.`,
    )
  }

  cachedAtlasImageData = decoded
  return cachedAtlasImageData
}
