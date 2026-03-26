import type { ChunkCoord } from '../types.ts'

import { CHUNK_SIZE } from './constants.ts'

export interface ChunkCoordsAroundPositionOptions {
  nearestFirst?: boolean
}

export const getChunkCoordsAroundPosition = (
  position: readonly [number, number, number],
  radius: number,
  options: ChunkCoordsAroundPositionOptions = {},
): ChunkCoord[] => {
  const centerChunkX = Math.floor(position[0] / CHUNK_SIZE)
  const centerChunkZ = Math.floor(position[2] / CHUNK_SIZE)
  const coords: Array<{
    coord: ChunkCoord
    distanceSquared: number
  }> = []

  for (let chunkZ = centerChunkZ - radius; chunkZ <= centerChunkZ + radius; chunkZ += 1) {
    for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1) {
      const deltaX = chunkX - centerChunkX
      const deltaZ = chunkZ - centerChunkZ
      coords.push({
        coord: {
          x: chunkX,
          z: chunkZ,
        },
        distanceSquared: deltaX * deltaX + deltaZ * deltaZ,
      })
    }
  }

  if (options.nearestFirst) {
    coords.sort((left, right) => {
      if (left.distanceSquared !== right.distanceSquared) {
        return left.distanceSquared - right.distanceSquared
      }

      if (left.coord.z !== right.coord.z) {
        return left.coord.z - right.coord.z
      }

      return left.coord.x - right.coord.x
    })
  }

  return coords.map((entry) => entry.coord)
}
