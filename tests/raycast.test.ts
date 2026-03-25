import { expect, test } from "bun:test";
import { vec3 } from "../packages/core/src/math/vec3.ts";
import { raycastVoxel } from "../packages/core/src/world/raycast.ts";
import { VoxelWorld } from "../packages/core/src/world/world.ts";

test("raycast returns the hit block and placement position", () => {
  const world = new VoxelWorld();
  const chunk = world.ensureChunk({ x: 0, y: 0, z: 0 });
  chunk.blocks.fill(0);
  chunk.dirty = true;
  world.setBlock(2, 2, 2, 3);

  const result = raycastVoxel(world, vec3(0.5, 2.5, 2.5), vec3(1, 0, 0), 10);

  expect(result).not.toBeNull();
  expect(result?.hit).toEqual({ x: 2, y: 2, z: 2 });
  expect(result?.place).toEqual({ x: 1, y: 2, z: 2 });
});
