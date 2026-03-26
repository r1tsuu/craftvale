import { ATLAS_TILE_SIZE, type AtlasTileId } from "../../../packages/core/src/world/atlas.ts";

type Rgba = readonly [number, number, number, number];

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

const createBedrockPixel = (x: number, y: number): Rgba => {
  const base = rgba(58, 58, 64);
  const noise = hash2d(x, y, 0x5d1f0bed);
  let color = tint(base, ((noise & 0x7) - 3) * 9);

  if ((x + y + ((noise >>> 6) & 0x3)) % 5 === 0) {
    color = tint(color, 18);
  } else if (((noise >>> 10) & 0xf) <= 2) {
    color = tint(color, -18);
  }

  if ((x === 0 || y === 0 || x === 15 || y === 15) && ((noise >>> 14) & 0x3) !== 0) {
    color = tint(color, -10);
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

const createGlowstonePixel = (x: number, y: number): Rgba => {
  const base = rgba(223, 186, 84);
  const noise = hash2d(x, y, 0xd1e917);
  let color = tint(base, ((noise & 0x7) - 3) * 9);

  if ((x + y) % 5 === 0) {
    color = tint(color, 18);
  } else if (((noise >>> 5) & 0xf) <= 1) {
    color = tint(color, -16);
  }

  if (x > 4 && x < 11 && y > 4 && y < 11) {
    color = tint(color, 14);
  }

  return color;
};

const DEFAULT_TILE_PIXEL_FACTORIES: Record<AtlasTileId, (x: number, y: number) => Rgba> = {
  "grass-top": createGrassTopPixel,
  "grass-side": createGrassSidePixel,
  dirt: createDirtPixel,
  stone: createStonePixel,
  bedrock: createBedrockPixel,
  "log-top": createLogTopPixel,
  "log-side": createLogSidePixel,
  leaves: createLeavesPixel,
  sand: createSandPixel,
  planks: createPlanksPixel,
  cobblestone: createCobblestonePixel,
  brick: createBrickPixel,
  glowstone: createGlowstonePixel,
};

export const buildDefaultVoxelTilePixels = (tileId: AtlasTileId): Uint8Array => {
  const pixels = new Uint8Array(ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4);
  const createPixel = DEFAULT_TILE_PIXEL_FACTORIES[tileId];
  for (let y = 0; y < ATLAS_TILE_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_TILE_SIZE; x += 1) {
      writePixel(pixels, x, y, ATLAS_TILE_SIZE, createPixel(x, y));
    }
  }
  return pixels;
};
