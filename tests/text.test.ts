import { expect, test } from "bun:test";
import { buildTextMesh } from "../apps/client/src/render/text-mesh.ts";

test("text mesh emits geometry for supported HUD text", () => {
  const mesh = buildTextMesh("FPS: 60.0", 20, 20, 3, [1, 1, 1]);

  expect(mesh.indexCount).toBeGreaterThan(0);
  expect(mesh.vertexData.length % 6).toBe(0);
});

test("text mesh renders slash-prefixed command text", () => {
  const mesh = buildTextMesh("/gamemode 1", 20, 20, 3, [1, 1, 1]);
  const slashOnlyMesh = buildTextMesh("/", 20, 20, 3, [1, 1, 1]);

  expect(slashOnlyMesh.indexCount).toBeGreaterThan(0);
  expect(mesh.indexCount).toBeGreaterThan(slashOnlyMesh.indexCount);
});
