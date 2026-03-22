import { expect, test } from "bun:test";
import { buildChunkMesh } from "../src/world/mesher.ts";
import { VoxelWorld } from "../src/world/world.ts";

test("single block emits six faces", () => {
  const world = new VoxelWorld();
  const chunk = world.ensureChunk({ x: 0, y: 0, z: 0 });
  chunk.blocks.fill(0);
  chunk.dirty = true;
  chunk.set(1, 1, 1, 3);

  const mesh = buildChunkMesh(world, chunk.coord);
  expect(mesh.indexCount).toBe(36);
});

test("fully enclosed block emits no faces", () => {
  const world = new VoxelWorld();
  const chunk = world.ensureChunk({ x: 0, y: 0, z: 0 });
  chunk.blocks.fill(0);
  chunk.dirty = true;

  for (let z = 0; z < 3; z += 1) {
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        chunk.set(x, y, z, 3);
      }
    }
  }

  const mesh = buildChunkMesh(world, chunk.coord);
  expect(mesh.indexCount).toBe(54 * 6);
});

test("chunk boundary checks neighbor chunk solidity", () => {
  const world = new VoxelWorld();
  const chunkA = world.ensureChunk({ x: 0, y: 0, z: 0 });
  const chunkB = world.ensureChunk({ x: 1, y: 0, z: 0 });

  chunkA.blocks.fill(0);
  chunkB.blocks.fill(0);
  chunkA.set(15, 1, 1, 3);
  chunkB.set(0, 1, 1, 3);

  const mesh = buildChunkMesh(world, chunkA.coord);
  expect(mesh.indexCount).toBe(30);
});
