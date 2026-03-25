import type { Vec3 } from "@voxel/core/shared";

const HIGHLIGHT_COLOR: readonly [number, number, number] = [0.97, 0.97, 0.97];
const HIGHLIGHT_EXPANSION = 0.002;

export const buildFocusHighlightMesh = (
  block: Vec3,
): { vertexData: Float32Array; indexData: Uint32Array } => {
  const minX = block.x - HIGHLIGHT_EXPANSION;
  const minY = block.y - HIGHLIGHT_EXPANSION;
  const minZ = block.z - HIGHLIGHT_EXPANSION;
  const maxX = block.x + 1 + HIGHLIGHT_EXPANSION;
  const maxY = block.y + 1 + HIGHLIGHT_EXPANSION;
  const maxZ = block.z + 1 + HIGHLIGHT_EXPANSION;
  const [red, green, blue] = HIGHLIGHT_COLOR;

  const vertexData = new Float32Array([
    minX, minY, minZ, red, green, blue,
    maxX, minY, minZ, red, green, blue,
    maxX, maxY, minZ, red, green, blue,
    minX, maxY, minZ, red, green, blue,
    minX, minY, maxZ, red, green, blue,
    maxX, minY, maxZ, red, green, blue,
    maxX, maxY, maxZ, red, green, blue,
    minX, maxY, maxZ, red, green, blue,
  ]);

  const indexData = new Uint32Array([
    0, 1, 1, 2, 2, 3, 3, 0,
    4, 5, 5, 6, 6, 7, 7, 4,
    0, 4, 1, 5, 2, 6, 3, 7,
  ]);

  return { vertexData, indexData };
};
