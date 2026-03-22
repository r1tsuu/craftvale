import type { BlockId, ChunkCoord, MeshData } from "../types.ts";
import { getAtlasUvRect } from "./atlas.ts";
import { Blocks, getBlockFaceTile, isSolidBlock, type BlockFaceRole } from "./blocks.ts";
import { CHUNK_SIZE } from "./constants.ts";
import { VoxelWorld } from "./world.ts";

const FACE_DEFINITIONS = [
  {
    faceRole: "side",
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
    faceRole: "side",
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
    faceRole: "top",
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
    faceRole: "bottom",
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
    faceRole: "side",
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
    faceRole: "side",
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
] as const;

const pushFace = (
  vertices: number[],
  indices: number[],
  baseIndex: number,
  blockId: BlockId,
  worldX: number,
  worldY: number,
  worldZ: number,
  face: (typeof FACE_DEFINITIONS)[number],
): void => {
  const tile = getBlockFaceTile(blockId, face.faceRole as BlockFaceRole);
  if (!tile) {
    return;
  }

  const uvRect = getAtlasUvRect(tile);
  const shade = face.shade;

  for (let index = 0; index < face.vertices.length; index += 1) {
    const [offsetX, offsetY, offsetZ] = face.vertices[index];
    const [u, v] = face.uvs[index];
    const atlasU = u === 0 ? uvRect.uMin : uvRect.uMax;
    const atlasV = v === 0 ? uvRect.vMin : uvRect.vMax;

    vertices.push(
      worldX + offsetX,
      worldY + offsetY,
      worldZ + offsetZ,
      atlasU,
      atlasV,
      shade,
    );
  }

  indices.push(
    baseIndex,
    baseIndex + 1,
    baseIndex + 2,
    baseIndex,
    baseIndex + 2,
    baseIndex + 3,
  );
};

export const buildChunkMesh = (
  world: VoxelWorld,
  coord: ChunkCoord,
): MeshData => {
  const chunk = world.getChunk(coord);
  if (!chunk) {
    return {
      vertexData: new Float32Array(),
      indexData: new Uint32Array(),
      indexCount: 0,
    };
  }

  const vertices: number[] = [];
  const indices: number[] = [];
  let baseIndex = 0;

  for (let localY = 0; localY < CHUNK_SIZE; localY += 1) {
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const blockId = chunk.get(localX, localY, localZ);
        if (!isSolidBlock(blockId)) {
          continue;
        }

        const worldX = coord.x * CHUNK_SIZE + localX;
        const worldY = coord.y * CHUNK_SIZE + localY;
        const worldZ = coord.z * CHUNK_SIZE + localZ;

        for (const face of FACE_DEFINITIONS) {
          const [dx, dy, dz] = face.normal;
          const neighbor = world.getBlock(worldX + dx, worldY + dy, worldZ + dz);
          if (neighbor !== 0 && Blocks[neighbor].solid) {
            continue;
          }

          pushFace(vertices, indices, baseIndex, blockId, worldX, worldY, worldZ, face);
          baseIndex += 4;
        }
      }
    }
  }

  chunk.dirty = false;

  return {
    vertexData: new Float32Array(vertices),
    indexData: new Uint32Array(indices),
    indexCount: indices.length,
  };
};
