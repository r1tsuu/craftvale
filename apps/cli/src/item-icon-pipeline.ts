import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ATLAS_TILE_SIZE,
  BLOCK_IDS,
  ITEM_IDS,
  ITEM_ICON_ATLAS_HEIGHT,
  ITEM_ICON_ATLAS_WIDTH,
  ITEM_ICON_ATLAS_COLUMNS,
  ITEM_ICON_IDS,
  ITEM_ICON_SIZE,
  AtlasTiles,
  decodePng,
  encodePng,
  getBlockFaceTile,
  getItemColor,
  getItemRenderBlockId,
  type AtlasTileId,
  type BlockFaceRole,
  type BlockId,
  type ItemId,
} from "@craftvale/core/shared";
import { clientAppRoot } from "./paths.ts";
import { VOXEL_ATLAS_OUTPUT_PATH } from "./voxel-atlas-pipeline.ts";

export const ITEM_ICON_TEXTURES_ROOT = join(clientAppRoot, "assets", "textures");
export const ITEM_ICON_ATLAS_OUTPUT_PATH = join(ITEM_ICON_TEXTURES_ROOT, "item-icons.png");

interface TileSource {
  pixels: Uint8Array;
  width: number;
  height: number;
}

interface IconFaceDefinition {
  faceRole: BlockFaceRole;
  shade: number;
  vertices: ReadonlyArray<readonly [number, number, number]>;
  uvs: ReadonlyArray<readonly [number, number]>;
}

const ICON_FACE_DEFINITIONS: readonly IconFaceDefinition[] = [
  {
    faceRole: "side",
    shade: 0.88,
    vertices: [
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
      [0.5, -0.5, 0.5],
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
    shade: 1,
    vertices: [
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
    ],
    uvs: [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
  },
  {
    faceRole: "side",
    shade: 0.72,
    vertices: [
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, -0.5, -0.5],
    ],
    uvs: [
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
];

const VIEWPORT_SCALE = ITEM_ICON_SIZE * 0.58;
const VIEWPORT_CENTER_X = ITEM_ICON_SIZE * 0.5;
const VIEWPORT_CENTER_Y = ITEM_ICON_SIZE * 0.46;
const COS_Y = Math.cos(-Math.PI / 4);
const SIN_Y = Math.sin(-Math.PI / 4);
const COS_X = Math.cos(-Math.PI / 6);
const SIN_X = Math.sin(-Math.PI / 6);

const rotateVertex = ([x, y, z]: readonly [number, number, number]): [number, number, number] => {
  const rotatedYX = x * COS_Y + z * SIN_Y;
  const rotatedYZ = -x * SIN_Y + z * COS_Y;
  const rotatedXY = y * COS_X - rotatedYZ * SIN_X;
  const rotatedXZ = y * SIN_X + rotatedYZ * COS_X;
  return [rotatedYX, rotatedXY, rotatedXZ];
};

const projectVertex = (
  vertex: readonly [number, number, number],
): { x: number; y: number; z: number } => {
  const [x, y, z] = rotateVertex(vertex);
  return {
    x: VIEWPORT_CENTER_X + x * VIEWPORT_SCALE,
    y: VIEWPORT_CENTER_Y - y * VIEWPORT_SCALE,
    z,
  };
};

const edgeFunction = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number => (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const sampleTile = (
  tile: TileSource,
  u: number,
  v: number,
): readonly [number, number, number, number] => {
  const sampleX = Math.max(0, Math.min(tile.width - 1, Math.round(u * (tile.width - 1))));
  const sampleY = Math.max(0, Math.min(tile.height - 1, Math.round(v * (tile.height - 1))));
  const index = (sampleX + sampleY * tile.width) * 4;
  return [
    tile.pixels[index] ?? 0,
    tile.pixels[index + 1] ?? 0,
    tile.pixels[index + 2] ?? 0,
    tile.pixels[index + 3] ?? 0,
  ];
};

const drawTriangle = (
  targetPixels: Uint8Array,
  depthBuffer: Float32Array,
  tile: TileSource,
  shade: number,
  vertices: readonly [
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
  ],
  uvs: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ],
): void => {
  const [a, b, c] = vertices;
  const area = edgeFunction(a.x, a.y, b.x, b.y, c.x, c.y);
  if (area === 0) {
    return;
  }

  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(ITEM_ICON_SIZE - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(ITEM_ICON_SIZE - 1, Math.ceil(Math.max(a.y, b.y, c.y)));

  for (let pixelY = minY; pixelY <= maxY; pixelY += 1) {
    for (let pixelX = minX; pixelX <= maxX; pixelX += 1) {
      const sampleX = pixelX + 0.5;
      const sampleY = pixelY + 0.5;
      const w0 = edgeFunction(b.x, b.y, c.x, c.y, sampleX, sampleY) / area;
      const w1 = edgeFunction(c.x, c.y, a.x, a.y, sampleX, sampleY) / area;
      const w2 = edgeFunction(a.x, a.y, b.x, b.y, sampleX, sampleY) / area;
      if (w0 < 0 || w1 < 0 || w2 < 0) {
        continue;
      }

      const depth = a.z * w0 + b.z * w1 + c.z * w2;
      const bufferIndex = pixelX + pixelY * ITEM_ICON_SIZE;
      if (depth <= depthBuffer[bufferIndex]!) {
        continue;
      }

      const u = uvs[0]![0] * w0 + uvs[1]![0] * w1 + uvs[2]![0] * w2;
      const v = uvs[0]![1] * w0 + uvs[1]![1] * w1 + uvs[2]![1] * w2;
      const [red, green, blue, alpha] = sampleTile(tile, u, v);
      if (alpha === 0) {
        continue;
      }

      const pixelIndex = bufferIndex * 4;
      targetPixels[pixelIndex] = clampByte(red * shade);
      targetPixels[pixelIndex + 1] = clampByte(green * shade);
      targetPixels[pixelIndex + 2] = clampByte(blue * shade);
      targetPixels[pixelIndex + 3] = alpha;
      depthBuffer[bufferIndex] = depth;
    }
  }
};

const drawFallbackIcon = (itemId: ItemId): Uint8Array => {
  const pixels = new Uint8Array(ITEM_ICON_SIZE * ITEM_ICON_SIZE * 4);
  const [red, green, blue] = getItemColor(itemId);

  for (let y = 6; y < ITEM_ICON_SIZE - 6; y += 1) {
    for (let x = 6; x < ITEM_ICON_SIZE - 6; x += 1) {
      const index = (x + y * ITEM_ICON_SIZE) * 4;
      const inset = Math.min(x - 6, y - 6, ITEM_ICON_SIZE - 7 - x, ITEM_ICON_SIZE - 7 - y);
      const shade = inset < 2 ? 0.82 : 1;
      pixels[index] = clampByte(red * 255 * shade);
      pixels[index + 1] = clampByte(green * 255 * shade);
      pixels[index + 2] = clampByte(blue * 255 * shade);
      pixels[index + 3] = 255;
    }
  }

  return pixels;
};

const buildBlockBackedIcon = (
  blockId: BlockId,
  tileSources: Record<AtlasTileId, TileSource>,
): Uint8Array => {
  const pixels = new Uint8Array(ITEM_ICON_SIZE * ITEM_ICON_SIZE * 4);
  const depthBuffer = new Float32Array(ITEM_ICON_SIZE * ITEM_ICON_SIZE);
  depthBuffer.fill(Number.NEGATIVE_INFINITY);

  for (const face of ICON_FACE_DEFINITIONS) {
    const tileId = getBlockFaceTile(blockId, face.faceRole);
    if (!tileId) {
      continue;
    }

    const projectedVertices = face.vertices.map(projectVertex) as [
      { x: number; y: number; z: number },
      { x: number; y: number; z: number },
      { x: number; y: number; z: number },
      { x: number; y: number; z: number },
    ];
    const tile = tileSources[tileId];
    drawTriangle(
      pixels,
      depthBuffer,
      tile,
      face.shade,
      [projectedVertices[0], projectedVertices[1], projectedVertices[2]],
      [face.uvs[0], face.uvs[1], face.uvs[2]],
    );
    drawTriangle(
      pixels,
      depthBuffer,
      tile,
      face.shade,
      [projectedVertices[0], projectedVertices[2], projectedVertices[3]],
      [face.uvs[0], face.uvs[2], face.uvs[3]],
    );
  }

  return pixels;
};

const buildItemIconPixels = (
  itemId: ItemId,
  tileSources: Record<AtlasTileId, TileSource>,
): Uint8Array => {
  const renderBlockId = getItemRenderBlockId(itemId);
  if (itemId === ITEM_IDS.empty) {
    return new Uint8Array(ITEM_ICON_SIZE * ITEM_ICON_SIZE * 4);
  }

  if (renderBlockId !== null && renderBlockId !== BLOCK_IDS.air) {
    return buildBlockBackedIcon(renderBlockId, tileSources);
  }

  return drawFallbackIcon(itemId);
};

export const buildItemIconAtlasPixels = async (): Promise<Uint8Array> => {
  const atlas = decodePng(new Uint8Array(await readFile(VOXEL_ATLAS_OUTPUT_PATH)));
  const tileSources = {} as Record<AtlasTileId, TileSource>;

  const sliceTile = (tileId: AtlasTileId): TileSource => {
    const cached = tileSources[tileId];
    if (cached) {
      return cached;
    }

    const tilePixels = new Uint8Array(ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4);
    const tileCoords = AtlasTiles[tileId];

    for (let y = 0; y < ATLAS_TILE_SIZE; y += 1) {
      for (let x = 0; x < ATLAS_TILE_SIZE; x += 1) {
        const sourceX = tileCoords.x * ATLAS_TILE_SIZE + x;
        const sourceY = tileCoords.y * ATLAS_TILE_SIZE + y;
        const sourceIndex = (sourceX + sourceY * atlas.width) * 4;
        const targetIndex = (x + y * ATLAS_TILE_SIZE) * 4;
        tilePixels[targetIndex] = atlas.pixels[sourceIndex]!;
        tilePixels[targetIndex + 1] = atlas.pixels[sourceIndex + 1]!;
        tilePixels[targetIndex + 2] = atlas.pixels[sourceIndex + 2]!;
        tilePixels[targetIndex + 3] = atlas.pixels[sourceIndex + 3]!;
      }
    }

    const source = {
      pixels: tilePixels,
      width: ATLAS_TILE_SIZE,
      height: ATLAS_TILE_SIZE,
    };
    tileSources[tileId] = source;
    return source;
  };

  const allTileIds = Object.keys(AtlasTiles) as AtlasTileId[];
  for (const tileId of allTileIds) {
    sliceTile(tileId);
  }

  const atlasPixels = new Uint8Array(ITEM_ICON_ATLAS_WIDTH * ITEM_ICON_ATLAS_HEIGHT * 4);

  for (let index = 0; index < ITEM_ICON_IDS.length; index += 1) {
    const itemId = ITEM_ICON_IDS[index]!;
    const iconPixels = buildItemIconPixels(itemId, tileSources);
    const cellX = (index % ITEM_ICON_ATLAS_COLUMNS) * ITEM_ICON_SIZE;
    const cellY = Math.floor(index / ITEM_ICON_ATLAS_COLUMNS) * ITEM_ICON_SIZE;

    for (let y = 0; y < ITEM_ICON_SIZE; y += 1) {
      for (let x = 0; x < ITEM_ICON_SIZE; x += 1) {
        const sourceIndex = (x + y * ITEM_ICON_SIZE) * 4;
        const targetIndex = (cellX + x + (cellY + y) * ITEM_ICON_ATLAS_WIDTH) * 4;
        atlasPixels[targetIndex] = iconPixels[sourceIndex]!;
        atlasPixels[targetIndex + 1] = iconPixels[sourceIndex + 1]!;
        atlasPixels[targetIndex + 2] = iconPixels[sourceIndex + 2]!;
        atlasPixels[targetIndex + 3] = iconPixels[sourceIndex + 3]!;
      }
    }
  }

  return atlasPixels;
};

export const buildItemIconAtlasPng = async (): Promise<Uint8Array> =>
  encodePng(ITEM_ICON_ATLAS_WIDTH, ITEM_ICON_ATLAS_HEIGHT, await buildItemIconAtlasPixels());

export const writeItemIconAtlas = async (): Promise<string> => {
  await mkdir(ITEM_ICON_TEXTURES_ROOT, { recursive: true });
  await writeFile(ITEM_ICON_ATLAS_OUTPUT_PATH, await buildItemIconAtlasPng());
  return ITEM_ICON_ATLAS_OUTPUT_PATH;
};
