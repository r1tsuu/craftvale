import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { clientAppRoot } from "./paths.ts";

const ATLAS_TILE_SIZE = 16;
const ATLAS_COLUMNS = 4;
const ATLAS_ROWS = 3;
const ATLAS_WIDTH = ATLAS_TILE_SIZE * ATLAS_COLUMNS;
const ATLAS_HEIGHT = ATLAS_TILE_SIZE * ATLAS_ROWS;

type AtlasTileId =
  | "grass-top"
  | "grass-side"
  | "dirt"
  | "stone"
  | "log-top"
  | "log-side"
  | "leaves"
  | "sand"
  | "planks"
  | "cobblestone"
  | "brick";
type Rgba = readonly [number, number, number, number];

const AtlasTiles: Record<AtlasTileId, { x: number; y: number }> = {
  "grass-top": { x: 0, y: 0 },
  "grass-side": { x: 1, y: 0 },
  "log-top": { x: 2, y: 0 },
  leaves: { x: 3, y: 0 },
  dirt: { x: 0, y: 1 },
  stone: { x: 1, y: 1 },
  "log-side": { x: 2, y: 1 },
  sand: { x: 3, y: 1 },
  planks: { x: 0, y: 2 },
  cobblestone: { x: 1, y: 2 },
  brick: { x: 2, y: 2 },
};

const rgba = (red: number, green: number, blue: number, alpha = 255): Rgba => [
  red,
  green,
  blue,
  alpha,
];

const clampColor = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const tint = (color: Rgba, amount: number): Rgba => [
  clampColor(color[0] + amount),
  clampColor(color[1] + amount),
  clampColor(color[2] + amount),
  color[3],
];

const hash2d = (x: number, y: number, seed: number): number => {
  let value = seed ^ Math.imul(x, 0x45d9f3b) ^ Math.imul(y, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
};

const writePixel = (
  pixels: Uint8Array,
  x: number,
  y: number,
  width: number,
  color: Rgba,
): void => {
  const index = (x + y * width) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3];
};

const fillTile = (
  pixels: Uint8Array,
  tile: AtlasTileId,
  colorForPixel: (x: number, y: number) => Rgba,
): void => {
  const origin = AtlasTiles[tile];
  for (let localY = 0; localY < ATLAS_TILE_SIZE; localY += 1) {
    for (let localX = 0; localX < ATLAS_TILE_SIZE; localX += 1) {
      writePixel(
        pixels,
        origin.x * ATLAS_TILE_SIZE + localX,
        origin.y * ATLAS_TILE_SIZE + localY,
        ATLAS_WIDTH,
        colorForPixel(localX, localY),
      );
    }
  }
};

const createGrassTopPixel = (x: number, y: number): Rgba => {
  const base = rgba(103, 175, 70);
  const shade = ((x + y) & 1) === 0 ? -4 : 5;
  let color = tint(base, shade);
  const noise = hash2d(x, y, 0x1234ab);

  if ((noise & 0x7) === 0) {
    color = tint(color, 22);
  } else if ((noise & 0xf) <= 2) {
    color = tint(color, -20);
  } else if (y < 3) {
    color = tint(color, 10);
  }

  return color;
};

const createDirtPixel = (x: number, y: number): Rgba => {
  const base = rgba(124, 84, 48);
  const noise = hash2d(x, y, 0x42d17a);
  let color = tint(base, ((noise & 0x3) - 1.5) * 10);

  if (((noise >>> 3) & 0x1f) === 0) {
    color = tint(color, 18);
  } else if (((noise >>> 5) & 0xf) <= 1) {
    color = tint(color, -18);
  }

  return color;
};

const createStonePixel = (x: number, y: number): Rgba => {
  const base = rgba(124, 124, 132);
  const noise = hash2d(x, y, 0x77a53d);
  let color = tint(base, ((noise & 0x7) - 3) * 7);

  if (((noise >>> 5) & 0xf) === 0) {
    color = tint(color, 24);
  } else if (((noise >>> 9) & 0xf) <= 1) {
    color = tint(color, -24);
  }

  return color;
};

const createGrassSidePixel = (x: number, y: number): Rgba => {
  if (y < 4) {
    return createGrassTopPixel(x, y + 5);
  }

  const dirtColor = createDirtPixel(x, y);
  if (y === 4) {
    return tint(dirtColor, -6);
  }

  const noise = hash2d(x, y, 0x55ef91);
  if ((noise & 0xf) <= 1 && y > 5 && y < 11) {
    return tint(dirtColor, -20);
  }

  return dirtColor;
};

const createLogTopPixel = (x: number, y: number): Rgba => {
  const centerX = 7.5;
  const centerY = 7.5;
  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const ring = Math.floor(distance * 1.35);
  const base = rgba(156, 122, 72);
  let color = tint(base, (ring % 2 === 0 ? 1 : -1) * 14);

  if (distance > 5.9) {
    color = rgba(93, 69, 39);
  } else if (((hash2d(x, y, 0x4f19a3) >>> 3) & 0x7) === 0) {
    color = tint(color, 12);
  }

  return color;
};

const createLogSidePixel = (x: number, y: number): Rgba => {
  const base = rgba(111, 82, 47);
  const stripe = ((x * 3 + ((y + x) & 1)) % 5) - 2;
  let color = tint(base, stripe * 7);
  const noise = hash2d(x, y, 0x99117b);

  if (((noise >>> 4) & 0xf) === 0) {
    color = tint(color, 10);
  } else if ((noise & 0xf) <= 1) {
    color = tint(color, -12);
  }

  return color;
};

const createLeavesPixel = (x: number, y: number): Rgba => {
  const base = rgba(72, 136, 55);
  const noise = hash2d(x, y, 0x83b51d);

  if (
    (x > 2 && x < 13 && y > 2 && y < 13 && (noise & 0x1f) === 0) ||
    ((noise >>> 8) & 0x3f) === 0
  ) {
    return rgba(0, 0, 0, 0);
  }

  let color = tint(base, ((noise >>> 4) & 0x3) * 7 - 8);
  if (((noise >>> 10) & 0xf) <= 1) {
    color = tint(color, 14);
  } else if ((x === 0 || y === 0 || x === 15 || y === 15) && ((noise >>> 14) & 0x3) <= 1) {
    color = tint(color, -10);
  }

  return color;
};

const createSandPixel = (x: number, y: number): Rgba => {
  const base = rgba(213, 198, 132);
  const noise = hash2d(x, y, 0x1187c3);
  let color = tint(base, ((noise & 0x7) - 3) * 4);

  if (((noise >>> 4) & 0xf) === 0) {
    color = tint(color, 14);
  } else if (((noise >>> 8) & 0xf) <= 1) {
    color = tint(color, -12);
  }

  return color;
};

const createPlanksPixel = (x: number, y: number): Rgba => {
  const base = rgba(168, 124, 70);
  const plankBand = Math.floor(y / 4);
  const grain = ((hash2d(x, y, 0x4ab292) & 0x7) - 3) * 3;
  let color = tint(base, plankBand % 2 === 0 ? 8 : -6);
  color = tint(color, grain);

  if (y % 4 === 0 || y % 4 === 3) {
    color = tint(color, -20);
  }

  if ((x === 2 || x === 13) && plankBand !== 1) {
    color = tint(color, -18);
  }

  return color;
};

const createCobblestonePixel = (x: number, y: number): Rgba => {
  const cellX = Math.floor(x / 4);
  const cellY = Math.floor(y / 4);
  const stoneSeed = hash2d(cellX, cellY, 0x6ca4f1);
  const base = rgba(118, 118, 124);
  let color = tint(base, ((stoneSeed & 0x7) - 3) * 7);

  if (x % 4 === 0 || y % 4 === 0) {
    color = rgba(86, 86, 92);
  } else if (((stoneSeed >>> 5) & 0x7) === 0) {
    color = tint(color, 14);
  }

  return color;
};

const createBrickPixel = (x: number, y: number): Rgba => {
  const mortar = rgba(157, 150, 144);
  const brickBase = rgba(162, 66, 48);
  const row = Math.floor(y / 4);
  const offset = row % 2 === 0 ? 0 : 4;
  const localX = (x + offset) % 8;

  if (y % 4 === 0 || localX === 0) {
    return mortar;
  }

  const noise = hash2d(x, y, 0x9f31d2);
  return tint(brickBase, ((noise & 0x7) - 3) * 4);
};

const createAtlasPixels = (): Uint8Array => {
  const pixels = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  fillTile(pixels, "grass-top", createGrassTopPixel);
  fillTile(pixels, "grass-side", createGrassSidePixel);
  fillTile(pixels, "dirt", createDirtPixel);
  fillTile(pixels, "stone", createStonePixel);
  fillTile(pixels, "log-top", createLogTopPixel);
  fillTile(pixels, "log-side", createLogSidePixel);
  fillTile(pixels, "leaves", createLeavesPixel);
  fillTile(pixels, "sand", createSandPixel);
  fillTile(pixels, "planks", createPlanksPixel);
  fillTile(pixels, "cobblestone", createCobblestonePixel);
  fillTile(pixels, "brick", createBrickPixel);
  return pixels;
};

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const makeChunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.byteLength);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.byteLength, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.byteLength + data.byteLength);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.byteLength);
  view.setUint32(8 + data.byteLength, crc32(crcInput), false);
  return chunk;
};

const encodePng = (width: number, height: number, pixels: Uint8Array): Uint8Array => {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const filtered = new Uint8Array(height * (stride + 1));
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (stride + 1);
    filtered[rowStart] = 0;
    filtered.set(pixels.subarray(row * stride, (row + 1) * stride), rowStart + 1);
  }

  const idat = new Uint8Array(deflateSync(filtered));
  const iend = new Uint8Array();

  const chunks = [
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idat),
    makeChunk("IEND", iend),
  ];
  const totalLength = signature.byteLength + chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const png = new Uint8Array(totalLength);

  let offset = 0;
  png.set(signature, offset);
  offset += signature.byteLength;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return png;
};

const atlasPath = join(clientAppRoot, "assets", "textures", "voxel-atlas.png");
mkdirSync(dirname(atlasPath), { recursive: true });
writeFileSync(atlasPath, encodePng(ATLAS_WIDTH, ATLAS_HEIGHT, createAtlasPixels()));
console.log(`Wrote ${atlasPath}`);
