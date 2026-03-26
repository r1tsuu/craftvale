import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  ATLAS_HEIGHT,
  ATLAS_TILE_IDS,
  ATLAS_TILE_SIZE,
  ATLAS_WIDTH,
  AtlasTiles,
  VOXEL_ATLAS_ASSET_PATH,
  getAtlasUvRect,
  loadVoxelAtlasImageData,
} from "../apps/client/src/world/atlas.ts";
import {
  VOXEL_ATLAS_OUTPUT_PATH,
  VOXEL_TILE_SOURCE_ROOT,
  buildVoxelAtlasPngFromSourceTiles,
  getVoxelTileSourcePath,
  loadVoxelTileSourcePixels,
} from "../apps/cli/src/voxel-atlas-pipeline.ts";

test("atlas PNG image data has the expected dimensions and byte size", () => {
  const atlas = loadVoxelAtlasImageData();

  expect(atlas.width).toBe(ATLAS_WIDTH);
  expect(atlas.height).toBe(ATLAS_HEIGHT);
  expect(atlas.pixels).toHaveLength(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  expect(VOXEL_ATLAS_ASSET_PATH.endsWith(".png")).toBe(true);
});

test("source tile PNGs exist for every atlas tile and stay at tile resolution", async () => {
  const tilePixelsById = await loadVoxelTileSourcePixels();

  expect(VOXEL_TILE_SOURCE_ROOT.endsWith("tiles-src")).toBe(true);
  expect(Object.keys(tilePixelsById)).toHaveLength(ATLAS_TILE_IDS.length);
  for (const tileId of ATLAS_TILE_IDS) {
    const tilePixels = tilePixelsById[tileId];
    expect(getVoxelTileSourcePath(tileId).endsWith(`${tileId}.png`)).toBe(true);
    expect(tilePixels).toHaveLength(ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4);
  }
});

test("atlas PNG stays in sync with the per-tile source PNGs", async () => {
  const atlasBytes = new Uint8Array(await readFile(VOXEL_ATLAS_OUTPUT_PATH));
  expect([...atlasBytes]).toEqual([...await buildVoxelAtlasPngFromSourceTiles()]);
});

test("atlas tile layout is fixed and UVs are inset within tile bounds", () => {
  expect(AtlasTiles["grass-top"]).toEqual({ x: 0, y: 0 });
  expect(AtlasTiles["grass-side"]).toEqual({ x: 1, y: 0 });
  expect(AtlasTiles["log-top"]).toEqual({ x: 2, y: 0 });
  expect(AtlasTiles.leaves).toEqual({ x: 3, y: 0 });
  expect(AtlasTiles.dirt).toEqual({ x: 0, y: 1 });
  expect(AtlasTiles.stone).toEqual({ x: 1, y: 1 });
  expect(AtlasTiles["log-side"]).toEqual({ x: 2, y: 1 });
  expect(AtlasTiles.sand).toEqual({ x: 3, y: 1 });
  expect(AtlasTiles.planks).toEqual({ x: 0, y: 2 });
  expect(AtlasTiles.cobblestone).toEqual({ x: 1, y: 2 });
  expect(AtlasTiles.brick).toEqual({ x: 2, y: 2 });
  expect(AtlasTiles.bedrock).toEqual({ x: 3, y: 2 });

  const rect = getAtlasUvRect("grass-top");
  expect(rect.uMin).toBeGreaterThan(0);
  expect(rect.uMax).toBeLessThan(ATLAS_TILE_SIZE / ATLAS_WIDTH);
  expect(rect.vMin).toBeGreaterThan(0);
  expect(rect.vMax).toBeLessThan(ATLAS_TILE_SIZE / ATLAS_HEIGHT);
});

test("leaves tile includes transparent pixels for cutout rendering", () => {
  const atlas = loadVoxelAtlasImageData();
  const tile = AtlasTiles.leaves;
  let transparentPixels = 0;

  for (let localY = 0; localY < ATLAS_TILE_SIZE; localY += 1) {
    for (let localX = 0; localX < ATLAS_TILE_SIZE; localX += 1) {
      const worldX = tile.x * ATLAS_TILE_SIZE + localX;
      const worldY = tile.y * ATLAS_TILE_SIZE + localY;
      const alphaIndex = (worldX + worldY * atlas.width) * 4 + 3;
      if (atlas.pixels[alphaIndex] === 0) {
        transparentPixels += 1;
      }
    }
  }

  expect(transparentPixels).toBeGreaterThan(0);
});

test("opaque atlas tiles are fully opaque", () => {
  const atlas = loadVoxelAtlasImageData();

  for (const tile of [
    AtlasTiles.sand,
    AtlasTiles.planks,
    AtlasTiles.cobblestone,
    AtlasTiles.brick,
    AtlasTiles.bedrock,
  ]) {
    for (let localY = 0; localY < ATLAS_TILE_SIZE; localY += 1) {
      for (let localX = 0; localX < ATLAS_TILE_SIZE; localX += 1) {
        const worldX = tile.x * ATLAS_TILE_SIZE + localX;
        const worldY = tile.y * ATLAS_TILE_SIZE + localY;
        const alphaIndex = (worldX + worldY * atlas.width) * 4 + 3;
        expect(atlas.pixels[alphaIndex]).toBe(255);
      }
    }
  }
});
