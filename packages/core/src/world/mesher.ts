import type { BlockId, ChunkCoord, MeshData, TerrainMeshData } from '../types.ts'
import type { VoxelWorld } from './world.ts'

import { getAtlasUvRect } from './atlas.ts'
import {
  type BlockFaceRole,
  doesBlockOccludeNeighborFace,
  getBlockFaceTile,
  getBlockRenderPass,
} from './blocks.ts'
import { CHUNK_SIZE } from './constants.ts'

const FACE_DEFINITIONS = [
  {
    faceRole: 'side',
    normal: [1, 0, 0],
    shade: 0.88,
    vertices: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
    uvs: [
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
  {
    faceRole: 'side',
    normal: [-1, 0, 0],
    shade: 0.72,
    vertices: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
    uvs: [
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
  {
    faceRole: 'top',
    normal: [0, 1, 0],
    shade: 1.0,
    vertices: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    uvs: [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
  },
  {
    faceRole: 'bottom',
    normal: [0, -1, 0],
    shade: 0.56,
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  },
  {
    faceRole: 'side',
    normal: [0, 0, 1],
    shade: 0.8,
    vertices: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
    uvs: [
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
  {
    faceRole: 'side',
    normal: [0, 0, -1],
    shade: 0.68,
    vertices: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
    uvs: [
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
] as const

interface MeshAccumulator {
  vertices: number[]
  indices: number[]
  baseIndex: number
}

interface FaceLightingDefinition {
  faceRole: BlockFaceRole
  normal: readonly [number, number, number]
  shade: number
  vertices: readonly (readonly [number, number, number])[]
  uvs: readonly (readonly [number, number])[]
  skyLight: number
  blockLight: number
}

const createMeshAccumulator = (): MeshAccumulator => ({
  vertices: [],
  indices: [],
  baseIndex: 0,
})

const toMeshData = (mesh: MeshAccumulator): MeshData => ({
  vertexData: new Float32Array(mesh.vertices),
  indexData: new Uint32Array(mesh.indices),
  indexCount: mesh.indices.length,
})

const createEmptyMeshData = (): MeshData => ({
  vertexData: new Float32Array(),
  indexData: new Uint32Array(),
  indexCount: 0,
})

const pushFace = (
  mesh: MeshAccumulator,
  blockId: BlockId,
  worldX: number,
  worldY: number,
  worldZ: number,
  face: FaceLightingDefinition,
): void => {
  const tile = getBlockFaceTile(blockId, face.faceRole as BlockFaceRole)
  if (!tile) {
    return
  }

  const uvRect = getAtlasUvRect(tile)
  const shade = face.shade

  for (let index = 0; index < face.vertices.length; index += 1) {
    const [offsetX, offsetY, offsetZ] = face.vertices[index]
    const [u, v] = face.uvs[index]
    const atlasU = u === 0 ? uvRect.uMin : uvRect.uMax
    const atlasV = v === 0 ? uvRect.vMin : uvRect.vMax

    mesh.vertices.push(
      worldX + offsetX,
      worldY + offsetY,
      worldZ + offsetZ,
      atlasU,
      atlasV,
      shade,
      face.skyLight,
      face.blockLight,
    )
  }

  mesh.indices.push(
    mesh.baseIndex,
    mesh.baseIndex + 1,
    mesh.baseIndex + 2,
    mesh.baseIndex,
    mesh.baseIndex + 2,
    mesh.baseIndex + 3,
  )
  mesh.baseIndex += 4
}

export const buildChunkMesh = (world: VoxelWorld, coord: ChunkCoord): TerrainMeshData => {
  const chunk = world.getChunk(coord)
  if (!chunk) {
    return {
      opaque: createEmptyMeshData(),
      cutout: createEmptyMeshData(),
      translucent: createEmptyMeshData(),
    }
  }

  const opaqueMesh = createMeshAccumulator()
  const cutoutMesh = createMeshAccumulator()
  const translucentMesh = createMeshAccumulator()

  for (let localY = 0; localY < CHUNK_SIZE; localY += 1) {
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const blockId = chunk.get(localX, localY, localZ)
        const renderPass = getBlockRenderPass(blockId)
        if (!renderPass) {
          continue
        }

        const worldX = coord.x * CHUNK_SIZE + localX
        const worldY = coord.y * CHUNK_SIZE + localY
        const worldZ = coord.z * CHUNK_SIZE + localZ
        const targetMesh =
          renderPass === 'opaque'
            ? opaqueMesh
            : renderPass === 'cutout'
              ? cutoutMesh
              : translucentMesh

        for (const face of FACE_DEFINITIONS) {
          const [dx, dy, dz] = face.normal
          const neighbor = world.getBlock(worldX + dx, worldY + dy, worldZ + dz)
          if (doesBlockOccludeNeighborFace(blockId, neighbor)) {
            continue
          }

          const skyLight = world.getSkyLight(worldX + dx, worldY + dy, worldZ + dz)
          const blockLight = world.getBlockLight(worldX + dx, worldY + dy, worldZ + dz)

          pushFace(targetMesh, blockId, worldX, worldY, worldZ, {
            ...face,
            skyLight,
            blockLight,
          })
        }
      }
    }
  }

  chunk.dirty = false

  return {
    opaque: toMeshData(opaqueMesh),
    cutout: toMeshData(cutoutMesh),
    translucent: toMeshData(translucentMesh),
  }
}
