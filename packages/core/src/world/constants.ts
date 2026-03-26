export const CHUNK_SIZE = 16
export const CHUNK_HEIGHT = 256
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE
export const ACTIVE_CHUNK_RADIUS = 2
export const STARTUP_CHUNK_RADIUS = 2
export const WORLD_HEIGHT_BLOCKS = CHUNK_HEIGHT
export const WORLD_MIN_BLOCK_Y = 0
export const WORLD_MAX_BLOCK_Y = WORLD_MIN_BLOCK_Y + WORLD_HEIGHT_BLOCKS - 1
export const WORLD_SEA_LEVEL = 64

export const isWithinWorldBlockY = (worldY: number): boolean =>
  worldY >= WORLD_MIN_BLOCK_Y && worldY <= WORLD_MAX_BLOCK_Y
