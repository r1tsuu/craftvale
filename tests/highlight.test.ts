import { expect, test } from "bun:test";
import { buildFocusHighlightMesh } from "../src/render/highlight-mesh.ts";

test("focus highlight mesh creates a full voxel edge box", () => {
  const mesh = buildFocusHighlightMesh({ x: 2, y: 3, z: 4 });

  expect(mesh.vertexData.length).toBe(8 * 6);
  expect(mesh.indexData.length).toBe(12 * 2);
  expect(mesh.vertexData[0]).toBeLessThan(2);
  expect(mesh.vertexData[6]).toBeGreaterThan(2.9);
});
