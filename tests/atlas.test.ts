import { expect, test } from "bun:test";
import {
  ATLAS_HEIGHT,
  ATLAS_TILE_SIZE,
  ATLAS_WIDTH,
  AtlasTiles,
  VOXEL_ATLAS_ASSET_PATH,
  getAtlasUvRect,
  loadVoxelAtlasImageData,
} from "../src/world/atlas.ts";

test("atlas PNG image data has the expected dimensions and byte size", () => {
  const atlas = loadVoxelAtlasImageData();

  expect(atlas.width).toBe(ATLAS_WIDTH);
  expect(atlas.height).toBe(ATLAS_HEIGHT);
  expect(atlas.pixels).toHaveLength(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  expect(VOXEL_ATLAS_ASSET_PATH.endsWith(".png")).toBe(true);
});

test("atlas tile layout is fixed and UVs are inset within tile bounds", () => {
  expect(AtlasTiles["grass-top"]).toEqual({ x: 0, y: 0 });
  expect(AtlasTiles["grass-side"]).toEqual({ x: 1, y: 0 });
  expect(AtlasTiles.dirt).toEqual({ x: 0, y: 1 });
  expect(AtlasTiles.stone).toEqual({ x: 1, y: 1 });

  const rect = getAtlasUvRect("grass-top");
  expect(rect.uMin).toBeGreaterThan(0);
  expect(rect.uMax).toBeLessThan(ATLAS_TILE_SIZE / (ATLAS_WIDTH / 2));
  expect(rect.vMin).toBeGreaterThan(0);
  expect(rect.vMax).toBeLessThan(ATLAS_TILE_SIZE / (ATLAS_HEIGHT / 2));
});
