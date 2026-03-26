import type { ChunkCoord } from '../types.ts'

import { CHUNK_SIZE, WORLD_MAX_CHUNK_Y, WORLD_MIN_CHUNK_Y } from './constants.ts'

export interface ChunkCoordsAroundPositionOptions {
  nearestFirst?: boolean
  verticalRadius?: number
}

export const getChunkCoordsAroundPosition = (
  position: readonly [number, number, number],
  radius: number,
  options: ChunkCoordsAroundPositionOptions = {},
): ChunkCoord[] => {
  const centerChunkX = Math.floor(position[0] / CHUNK_SIZE)
  const centerChunkY = Math.floor(position[1] / CHUNK_SIZE)
  const centerChunkZ = Math.floor(position[2] / CHUNK_SIZE)
  const minChunkY =
    options.verticalRadius === undefined
      ? WORLD_MIN_CHUNK_Y
      : Math.max(WORLD_MIN_CHUNK_Y, centerChunkY - options.verticalRadius)
  const maxChunkY =
    options.verticalRadius === undefined
      ? WORLD_MAX_CHUNK_Y
      : Math.min(WORLD_MAX_CHUNK_Y, centerChunkY + options.verticalRadius)
  const coords: Array<{
    coord: ChunkCoord
    distanceSquared: number
  }> = []

  for (let chunkZ = centerChunkZ - radius; chunkZ <= centerChunkZ + radius; chunkZ += 1) {
    for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1) {
      for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
        const deltaX = chunkX - centerChunkX
        const deltaY = chunkY - centerChunkY
        const deltaZ = chunkZ - centerChunkZ
        coords.push({
          coord: {
            x: chunkX,
            y: chunkY,
            z: chunkZ,
          },
          distanceSquared: deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ,
        })
      }
    }
  }

  if (options.nearestFirst) {
    coords.sort((left, right) => {
      if (left.distanceSquared !== right.distanceSquared) {
        return left.distanceSquared - right.distanceSquared
      }

      if (left.coord.y !== right.coord.y) {
        return left.coord.y - right.coord.y
      }

      if (left.coord.z !== right.coord.z) {
        return left.coord.z - right.coord.z
      }

      return left.coord.x - right.coord.x
    })
  }

  return coords.map((entry) => entry.coord)
}
