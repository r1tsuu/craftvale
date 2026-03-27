import type { Vec3 } from '@craftvale/core/shared'

const HIGHLIGHT_EXPANSION = 0.002

const getHighlightColor = (progress: number): [number, number, number] => {
  if (progress <= 0) return [0.97, 0.97, 0.97]
  if (progress <= 0.5) {
    const t = progress / 0.5
    return [0.97 + 0.03 * t, 0.97 - 0.32 * t, 0.97 - 0.87 * t]
  }
  const t = (progress - 0.5) / 0.5
  return [1.0, 0.65 - 0.5 * t, 0.1]
}

export const buildFocusHighlightMesh = (
  block: Vec3,
  breakProgress = 0,
): { vertexData: Float32Array; indexData: Uint32Array } => {
  const minX = block.x - HIGHLIGHT_EXPANSION
  const minY = block.y - HIGHLIGHT_EXPANSION
  const minZ = block.z - HIGHLIGHT_EXPANSION
  const maxX = block.x + 1 + HIGHLIGHT_EXPANSION
  const maxY = block.y + 1 + HIGHLIGHT_EXPANSION
  const maxZ = block.z + 1 + HIGHLIGHT_EXPANSION
  const [red, green, blue] = getHighlightColor(breakProgress)

  const vertexData = new Float32Array([
    minX,
    minY,
    minZ,
    red,
    green,
    blue,
    maxX,
    minY,
    minZ,
    red,
    green,
    blue,
    maxX,
    maxY,
    minZ,
    red,
    green,
    blue,
    minX,
    maxY,
    minZ,
    red,
    green,
    blue,
    minX,
    minY,
    maxZ,
    red,
    green,
    blue,
    maxX,
    minY,
    maxZ,
    red,
    green,
    blue,
    maxX,
    maxY,
    maxZ,
    red,
    green,
    blue,
    minX,
    maxY,
    maxZ,
    red,
    green,
    blue,
  ])

  const indexData = new Uint32Array([
    0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7,
  ])

  return { vertexData, indexData }
}
