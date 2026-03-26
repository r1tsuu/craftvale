import {
  type BlockId,
  getAtlasUvRect,
  getBlockFaceTile,
  ITEM_RENDER_FACE_DEFINITIONS,
  LIGHT_LEVEL_MAX,
  type MeshData,
} from '@craftvale/core/shared'

export const buildItemBlockMesh = (blockId: BlockId): MeshData => {
  const vertices: number[] = []
  const indices: number[] = []
  let baseIndex = 0

  for (const face of ITEM_RENDER_FACE_DEFINITIONS) {
    const tile = getBlockFaceTile(blockId, face.faceRole)
    if (!tile) {
      continue
    }

    const uvRect = getAtlasUvRect(tile)
    for (let index = 0; index < face.vertices.length; index += 1) {
      const [x, y, z] = face.vertices[index]!
      const [u, v] = face.uvs[index]!
      vertices.push(
        x,
        y,
        z,
        u === 0 ? uvRect.uMin : uvRect.uMax,
        v === 0 ? uvRect.vMin : uvRect.vMax,
        face.shade,
        LIGHT_LEVEL_MAX,
        0,
      )
    }

    indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
    baseIndex += 4
  }

  return {
    vertexData: new Float32Array(vertices),
    indexData: new Uint32Array(indices),
    indexCount: indices.length,
  }
}
