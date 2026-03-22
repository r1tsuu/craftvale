import { expect, test } from "bun:test";
import { getAtlasUvRect } from "../src/world/atlas.ts";
import { buildChunkMesh } from "../src/world/mesher.ts";
import type { MeshData } from "../src/types.ts";
import { VoxelWorld } from "../src/world/world.ts";

const FLOATS_PER_VERTEX = 6;
const VERTICES_PER_FACE = 4;

const getFaceUvs = (
  mesh: MeshData,
  faceIndex: number,
): Array<{ u: number; v: number }> => {
  const start = faceIndex * VERTICES_PER_FACE * FLOATS_PER_VERTEX;
  const face: Array<{ u: number; v: number }> = [];

  for (let vertex = 0; vertex < VERTICES_PER_FACE; vertex += 1) {
    const offset = start + vertex * FLOATS_PER_VERTEX;
    face.push({
      u: mesh.vertexData[offset + 3]!,
      v: mesh.vertexData[offset + 4]!,
    });
  }

  return face;
};

const expectFaceUsesTile = (
  mesh: MeshData,
  faceIndex: number,
  tile: Parameters<typeof getAtlasUvRect>[0],
): void => {
  const rect = getAtlasUvRect(tile);
  const faceUvs = getFaceUvs(mesh, faceIndex);

  for (const uv of faceUvs) {
    expect(uv.u).toBeGreaterThanOrEqual(rect.uMin);
    expect(uv.u).toBeLessThanOrEqual(rect.uMax);
    expect(uv.v).toBeGreaterThanOrEqual(rect.vMin);
    expect(uv.v).toBeLessThanOrEqual(rect.vMax);
  }
};

test("single block emits six faces", () => {
  const world = new VoxelWorld();
  const chunk = world.ensureChunk({ x: 0, y: 0, z: 0 });
  chunk.blocks.fill(0);
  chunk.dirty = true;
  chunk.set(1, 1, 1, 3);

  const mesh = buildChunkMesh(world, chunk.coord);
  expect(mesh.opaque.indexCount).toBe(36);
  expect(mesh.cutout.indexCount).toBe(0);
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
  expect(mesh.opaque.indexCount).toBe(54 * 6);
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
  expect(mesh.opaque.indexCount).toBe(30);
});

test("grass uses distinct top, bottom, and side atlas tiles", () => {
  const world = new VoxelWorld();
  const chunk = world.ensureChunk({ x: 0, y: 0, z: 0 });
  chunk.blocks.fill(0);
  chunk.dirty = true;
  chunk.set(1, 1, 1, 1);

  const mesh = buildChunkMesh(world, chunk.coord);

  expectFaceUsesTile(mesh.opaque, 0, "grass-side");
  expectFaceUsesTile(mesh.opaque, 2, "grass-top");
  expectFaceUsesTile(mesh.opaque, 3, "dirt");
});

test("dirt and stone reuse the same tile on every face", () => {
  const world = new VoxelWorld();
  const dirtChunk = world.ensureChunk({ x: 0, y: 0, z: 0 });
  dirtChunk.blocks.fill(0);
  dirtChunk.dirty = true;
  dirtChunk.set(1, 1, 1, 2);

  const dirtMesh = buildChunkMesh(world, dirtChunk.coord);
  expectFaceUsesTile(dirtMesh.opaque, 0, "dirt");
  expectFaceUsesTile(dirtMesh.opaque, 2, "dirt");

  const stoneChunk = world.ensureChunk({ x: 1, y: 0, z: 0 });
  stoneChunk.blocks.fill(0);
  stoneChunk.dirty = true;
  stoneChunk.set(1, 1, 1, 3);

  const stoneMesh = buildChunkMesh(world, stoneChunk.coord);
  expectFaceUsesTile(stoneMesh.opaque, 0, "stone");
  expectFaceUsesTile(stoneMesh.opaque, 2, "stone");
});

test("logs use distinct top and side atlas tiles", () => {
  const world = new VoxelWorld();
  const chunk = world.ensureChunk({ x: 0, y: 0, z: 0 });
  chunk.blocks.fill(0);
  chunk.dirty = true;
  chunk.set(1, 1, 1, 4);

  const mesh = buildChunkMesh(world, chunk.coord);

  expectFaceUsesTile(mesh.opaque, 0, "log-side");
  expectFaceUsesTile(mesh.opaque, 2, "log-top");
  expectFaceUsesTile(mesh.opaque, 3, "log-top");
});

test("leaves emit cutout faces and use the leaves atlas tile", () => {
  const world = new VoxelWorld();
  const chunk = world.ensureChunk({ x: 0, y: 0, z: 0 });
  chunk.blocks.fill(0);
  chunk.dirty = true;
  chunk.set(1, 1, 1, 5);

  const mesh = buildChunkMesh(world, chunk.coord);

  expect(mesh.opaque.indexCount).toBe(0);
  expect(mesh.cutout.indexCount).toBe(36);
  expectFaceUsesTile(mesh.cutout, 0, "leaves");
  expectFaceUsesTile(mesh.cutout, 2, "leaves");
});

test("opaque faces next to leaves are not culled", () => {
  const world = new VoxelWorld();
  const chunk = world.ensureChunk({ x: 0, y: 0, z: 0 });
  chunk.blocks.fill(0);
  chunk.dirty = true;
  chunk.set(1, 1, 1, 1);
  chunk.set(2, 1, 1, 5);

  const mesh = buildChunkMesh(world, chunk.coord);

  expect(mesh.opaque.indexCount).toBe(36);
  expect(mesh.cutout.indexCount).toBe(30);
});

test("adjacent leaves cull shared internal faces", () => {
  const world = new VoxelWorld();
  const chunk = world.ensureChunk({ x: 0, y: 0, z: 0 });
  chunk.blocks.fill(0);
  chunk.dirty = true;
  chunk.set(1, 1, 1, 5);
  chunk.set(2, 1, 1, 5);

  const mesh = buildChunkMesh(world, chunk.coord);
  expect(mesh.cutout.indexCount).toBe(60);
});
