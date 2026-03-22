import { expect, test } from "bun:test";
import { buildTextMesh } from "../src/render/text-mesh.ts";

test("text mesh emits geometry for supported HUD text", () => {
  const mesh = buildTextMesh("FPS: 60.0", 20, 20, 3, [1, 1, 1]);

  expect(mesh.indexCount).toBeGreaterThan(0);
  expect(mesh.vertexData.length % 5).toBe(0);
});
