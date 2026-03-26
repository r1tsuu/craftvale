import type { ChunkCoord } from '../types.ts'

import { CHUNK_SIZE, WORLD_LAYER_CHUNKS_Y } from './constants.ts'

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
  const columns: Array<{ x: number; z: number; distanceSquared: number }> = []

  for (let chunkZ = centerChunkZ - radius; chunkZ <= centerChunkZ + radius; chunkZ += 1) {
    for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1) {
      const deltaX = chunkX - centerChunkX
      const deltaZ = chunkZ - centerChunkZ
      columns.push({
        x: chunkX,
        z: chunkZ,
        distanceSquared: deltaX * deltaX + deltaZ * deltaZ,
      })
    }
  }

  if (options.nearestFirst) {
    columns.sort((left, right) => {
      if (left.distanceSquared !== right.distanceSquared) {
        return left.distanceSquared - right.distanceSquared
      }

      if (left.z !== right.z) {
        return left.z - right.z
      }

      return left.x - right.x
    })
  }

  const coords: ChunkCoord[] = []
  for (const column of columns) {
    for (const chunkY of WORLD_LAYER_CHUNKS_Y) {
      coords.push({
        x: column.x,
        y: chunkY,
        z: column.z,
      })
    }
  }

  return coords
}
