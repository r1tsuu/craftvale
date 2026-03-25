import { vec3, type Vec3 } from "../math/vec3.ts";
import { VoxelWorld } from "./world.ts";

export interface RaycastHit {
  hit: Vec3;
  place: Vec3;
}

export const raycastVoxel = (
  world: VoxelWorld,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  stepSize = 0.05,
): RaycastHit | null => {
  const current = vec3(Math.floor(origin.x), Math.floor(origin.y), Math.floor(origin.z));

  for (let distance = 0; distance <= maxDistance; distance += stepSize) {
    const sample = vec3(
      origin.x + direction.x * distance,
      origin.y + direction.y * distance,
      origin.z + direction.z * distance,
    );

    const voxel = vec3(Math.floor(sample.x), Math.floor(sample.y), Math.floor(sample.z));

    if (
      voxel.x === current.x &&
      voxel.y === current.y &&
      voxel.z === current.z &&
      distance !== 0
    ) {
      continue;
    }

    if (world.getBlock(voxel.x, voxel.y, voxel.z) !== 0) {
      return {
        hit: voxel,
        place: current,
      };
    }

    current.x = voxel.x;
    current.y = voxel.y;
    current.z = voxel.z;
  }

  return null;
};
