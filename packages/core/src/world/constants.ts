export const CHUNK_SIZE = 16
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE
export const ACTIVE_CHUNK_RADIUS = 2
export const STARTUP_CHUNK_RADIUS = 2
export const ACTIVE_CHUNK_VERTICAL_RADIUS = 2
export const STARTUP_CHUNK_VERTICAL_RADIUS = 2
export const WORLD_HEIGHT_BLOCKS = 256
export const WORLD_MIN_BLOCK_Y = 0
export const WORLD_MAX_BLOCK_Y = WORLD_MIN_BLOCK_Y + WORLD_HEIGHT_BLOCKS - 1
export const WORLD_CHUNK_LAYERS = WORLD_HEIGHT_BLOCKS / CHUNK_SIZE
export const WORLD_MIN_CHUNK_Y = Math.floor(WORLD_MIN_BLOCK_Y / CHUNK_SIZE)
export const WORLD_MAX_CHUNK_Y = WORLD_MIN_CHUNK_Y + WORLD_CHUNK_LAYERS - 1
export const WORLD_SEA_LEVEL = 64
export const WORLD_LAYER_CHUNKS_Y = Object.freeze(
  Array.from({ length: WORLD_CHUNK_LAYERS }, (_, index) => WORLD_MIN_CHUNK_Y + index),
)

export const isWithinWorldBlockY = (worldY: number): boolean =>
  worldY >= WORLD_MIN_BLOCK_Y && worldY <= WORLD_MAX_BLOCK_Y

export const isWithinWorldChunkY = (chunkY: number): boolean =>
  chunkY >= WORLD_MIN_CHUNK_Y && chunkY <= WORLD_MAX_CHUNK_Y
