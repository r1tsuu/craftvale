import {
  ATLAS_HEIGHT,
  ATLAS_TILE_IDS,
  ATLAS_TILE_SIZE,
  ATLAS_WIDTH,
  type AtlasTileId,
  AtlasTiles,
  decodePng,
  encodePng,
} from '@craftvale/core/shared'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import { buildDefaultVoxelTilePixels } from './default-voxel-tile-sources.ts'
import { clientAppRoot } from './paths.ts'

export const VOXEL_TEXTURES_ROOT = join(clientAppRoot, 'assets', 'textures')
export const VOXEL_TILE_SOURCE_ROOT = join(VOXEL_TEXTURES_ROOT, 'tiles-src')
export const VOXEL_ATLAS_OUTPUT_PATH = join(VOXEL_TEXTURES_ROOT, 'voxel-atlas.png')

const ATLAS_TILE_ID_SET = new Set<string>(ATLAS_TILE_IDS)

const getPngTileIdsInDirectory = async (): Promise<Set<string>> => {
  const entries = await readdir(VOXEL_TILE_SOURCE_ROOT, {
    withFileTypes: true,
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  })

  const tileIds = new Set<string>()
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name) !== '.png') {
      continue
    }

    const tileId = basename(entry.name, '.png')
    if (!ATLAS_TILE_ID_SET.has(tileId)) {
      throw new Error(`Unexpected tile source PNG "${entry.name}" in ${VOXEL_TILE_SOURCE_ROOT}.`)
    }

    tileIds.add(tileId)
  }

  return tileIds
}

export const getVoxelTileSourcePath = (tileId: AtlasTileId): string =>
  join(VOXEL_TILE_SOURCE_ROOT, `${tileId}.png`)

export const loadVoxelTileSourcePixels = async (): Promise<Record<AtlasTileId, Uint8Array>> => {
  const discoveredTileIds = await getPngTileIdsInDirectory()
  const tiles = {} as Record<AtlasTileId, Uint8Array>

  for (const tileId of ATLAS_TILE_IDS) {
    if (!discoveredTileIds.has(tileId)) {
      throw new Error(
        `Missing tile source PNG for "${tileId}". Expected ${getVoxelTileSourcePath(tileId)}.`,
      )
    }

    const decoded = decodePng(await readFile(getVoxelTileSourcePath(tileId)))
    if (decoded.width !== ATLAS_TILE_SIZE || decoded.height !== ATLAS_TILE_SIZE) {
      throw new Error(
        `Tile "${tileId}" must be ${ATLAS_TILE_SIZE}x${ATLAS_TILE_SIZE}, got ${decoded.width}x${decoded.height}.`,
      )
    }

    tiles[tileId] = decoded.pixels
  }

  return tiles
}

export const buildVoxelAtlasPixels = (
  tilePixelsById: Record<AtlasTileId, Uint8Array>,
): Uint8Array => {
  const atlasPixels = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4)

  for (const tileId of ATLAS_TILE_IDS) {
    const tilePixels = tilePixelsById[tileId]
    const origin = AtlasTiles[tileId]

    for (let localY = 0; localY < ATLAS_TILE_SIZE; localY += 1) {
      for (let localX = 0; localX < ATLAS_TILE_SIZE; localX += 1) {
        const tileIndex = (localX + localY * ATLAS_TILE_SIZE) * 4
        const atlasX = origin.x * ATLAS_TILE_SIZE + localX
        const atlasY = origin.y * ATLAS_TILE_SIZE + localY
        const atlasIndex = (atlasX + atlasY * ATLAS_WIDTH) * 4
        atlasPixels[atlasIndex] = tilePixels[tileIndex]!
        atlasPixels[atlasIndex + 1] = tilePixels[tileIndex + 1]!
        atlasPixels[atlasIndex + 2] = tilePixels[tileIndex + 2]!
        atlasPixels[atlasIndex + 3] = tilePixels[tileIndex + 3]!
      }
    }
  }

  return atlasPixels
}

export const buildVoxelAtlasPngFromSourceTiles = async (): Promise<Uint8Array> => {
  const tilePixelsById = await loadVoxelTileSourcePixels()
  return encodePng(ATLAS_WIDTH, ATLAS_HEIGHT, buildVoxelAtlasPixels(tilePixelsById))
}

export const writeVoxelAtlasFromSourceTiles = async (): Promise<string> => {
  await mkdir(VOXEL_TEXTURES_ROOT, { recursive: true })
  await writeFile(VOXEL_ATLAS_OUTPUT_PATH, await buildVoxelAtlasPngFromSourceTiles())
  return VOXEL_ATLAS_OUTPUT_PATH
}

export const writeDefaultVoxelTileSources = async (): Promise<string[]> => {
  await mkdir(VOXEL_TILE_SOURCE_ROOT, { recursive: true })
  const writtenPaths: string[] = []

  for (const tileId of ATLAS_TILE_IDS) {
    const tilePath = getVoxelTileSourcePath(tileId)
    await writeFile(
      tilePath,
      encodePng(ATLAS_TILE_SIZE, ATLAS_TILE_SIZE, buildDefaultVoxelTilePixels(tileId)),
    )
    writtenPaths.push(tilePath)
  }

  return writtenPaths
}
