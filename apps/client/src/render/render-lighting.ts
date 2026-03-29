import type { Vec3, VoxelWorld } from '@craftvale/core/shared'

export interface RenderLightSample {
  skyLight: number
  blockLight: number
}

export const sampleRenderLightingAtPosition = (
  world: VoxelWorld,
  position: Vec3,
): RenderLightSample => {
  const blockX = Math.floor(position.x)
  const blockY = Math.floor(position.y)
  const blockZ = Math.floor(position.z)

  return {
    skyLight: world.getSkyLight(blockX, blockY, blockZ),
    blockLight: world.getBlockLight(blockX, blockY, blockZ),
  }
}
