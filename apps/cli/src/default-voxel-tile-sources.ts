import { ATLAS_TILE_SIZE, type AtlasTileId } from '../../../packages/core/src/world/atlas.ts'

type Rgba = readonly [number, number, number, number]

const rgba = (red: number, green: number, blue: number, alpha = 255): Rgba => [
  red,
  green,
  blue,
  alpha,
]

const clampColor = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))

const tint = (color: Rgba, amount: number): Rgba => [
  clampColor(color[0] + amount),
  clampColor(color[1] + amount),
  clampColor(color[2] + amount),
  color[3],
]

const hash2d = (x: number, y: number, seed: number): number => {
  let value = seed ^ Math.imul(x, 0x45d9f3b) ^ Math.imul(y, 0x27d4eb2d)
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b)
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35)
  value ^= value >>> 16
  return value >>> 0
}

// Returns a jittered float in [−0.5, 0.5] for a given cell and axis
const hash2dFloat = (x: number, y: number, seed: number): number =>
  (hash2d(x, y, seed) & 0xff) / 255 - 0.5

// Returns the value from a 2D Gaussian-style soft blob centred at (cx, cy)
const blobWeight = (x: number, y: number, cx: number, cy: number, r: number): number => {
  const dx = x - cx,
    dy = y - cy
  return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / r)
}

const writePixel = (pixels: Uint8Array, x: number, y: number, width: number, color: Rgba): void => {
  const index = (x + y * width) * 4
  pixels[index] = color[0]
  pixels[index + 1] = color[1]
  pixels[index + 2] = color[2]
  pixels[index + 3] = color[3]
}

const createGrassTopPixel = (x: number, y: number): Rgba => {
  const base = rgba(88, 147, 48)
  // Two-tone dither: odd pixels slightly brighter
  let color = tint(base, (x + y) & 1 ? 8 : 0)
  const noise = hash2d(x, y, 0x1234ab)
  if ((noise & 0x1f) === 0) {
    color = tint(base, 20)
  } else if ((noise & 0x3f) <= 2) {
    color = tint(base, -14)
  }
  return color
}

const createDirtPixel = (x: number, y: number): Rgba => {
  const base = rgba(134, 96, 67)
  const noise = hash2d(x, y, 0x42d17a)
  let color = tint(base, Math.round(((noise & 0x3) - 1.5) * 6))
  // Pebble-sized dark specks at 2x2 granularity
  const cellHash = hash2d(x >> 1, y >> 1, 0x8b31c4)
  if ((cellHash & 0x1f) === 0) {
    color = tint(color, -28)
  } else if ((cellHash & 0x7f) <= 4) {
    color = tint(color, 18)
  }
  return color
}

const createStonePixel = (x: number, y: number): Rgba => {
  // Per-pixel micro-noise ±10 around mid-grey base
  const microNoise = hash2d(x, y, 0xab77c3)
  const micro = ((microNoise & 0x7) - 3) * 3
  // Occasional darker mineral-grain blobs at 3x3 granularity (~1 in 7), delta -20
  const blobHash = hash2d(Math.floor(x / 3), Math.floor(y / 3), 0x77a53d)
  const darkOffset = (blobHash & 0x7) === 0 ? -20 : 0
  const v = clampColor(125 + micro + darkOffset)
  return rgba(v, v, v)
}

const createBedrockPixel = (x: number, y: number): Rgba => {
  const base = rgba(58, 58, 64)
  const noise = hash2d(x, y, 0x5d1f0bed)
  let color = tint(base, ((noise & 0x7) - 3) * 9)
  // Irregular dark inclusions (same approach as stone blobs)
  const cellHash = hash2d(x >> 1, y >> 1, 0xbe3d17)
  if ((cellHash & 0x7) === 0) {
    color = tint(color, -22)
  } else if (((noise >>> 8) & 0xf) <= 2) {
    color = tint(color, 14)
  }
  return color
}

const createGrassSidePixel = (x: number, y: number): Rgba => {
  // Rows 0–2: green band; row 3: olive transition; rows 4+: clean dirt
  if (y <= 2) {
    return createGrassTopPixel(x, y)
  }
  if (y === 3) {
    const d = createDirtPixel(x, y)
    return rgba(clampColor(d[0] - 5), clampColor(d[1] + 4), clampColor(d[2] - 10), 255)
  }
  return createDirtPixel(x, y)
}

const createLogTopPixel = (x: number, y: number): Rgba => {
  const centerX = 7.5
  const centerY = 7.5
  const dx = x - centerX
  const dy = y - centerY
  const distance = Math.sqrt(dx * dx + dy * dy)
  const ring = Math.floor(distance * 1.35)
  const base = rgba(156, 122, 72)
  let color = tint(base, (ring % 2 === 0 ? 1 : -1) * 18)

  if (distance > 6.2) {
    color = rgba(93, 69, 39)
  } else if (((hash2d(x, y, 0x4f19a3) >>> 3) & 0x7) === 0) {
    color = tint(color, 12)
  }

  return color
}

const createLogSidePixel = (x: number, y: number): Rgba => {
  const base = rgba(102, 81, 51)
  // Per-column hash for vertical grain (±12)
  const colHash = hash2d(x, 0, 0x99117b)
  const colGrain = Math.round(((colHash & 0x1f) - 15) * 0.75)
  // Per-row micro-variation (±4)
  const rowHash = hash2d(0, y, 0x77b234)
  const rowMicro = (rowHash & 0x7) - 3
  let color = tint(base, colGrain + rowMicro)
  // Subtle knot suggestion rows 6–9
  if (y >= 6 && y <= 9) {
    const knotHash = hash2d(x, 0, 0x3a1c87)
    if ((knotHash & 0xf) === 0) {
      color = tint(color, -8)
    }
  }
  return color
}

const createLeavesPixel = (x: number, y: number): Rgba => {
  const base = rgba(59, 118, 44)
  // Clustered transparency: 2x2 region hash so holes group naturally
  const regionHash = hash2d(x >> 1, y >> 1, 0x83b51d)
  if ((regionHash & 0x7) === 0) {
    return rgba(0, 0, 0, 0)
  }
  const noise = hash2d(x, y, 0xa3b51d)
  let color = tint(base, ((noise >>> 4) & 0x3) * 7 - 8)
  if (((noise >>> 10) & 0xf) <= 1) {
    color = tint(color, 14)
  } else if ((x === 0 || y === 0 || x === 15 || y === 15) && ((noise >>> 14) & 0x3) <= 1) {
    color = tint(color, -10)
  }
  return color
}

const createSandPixel = (x: number, y: number): Rgba => {
  const base = rgba(219, 207, 163)
  // 3x3 averaged noise for grain clusters
  let sum = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      sum += hash2d(x + dx, y + dy, 0x1187c3) & 0xff
    }
  }
  return tint(base, Math.round((sum / 9 / 255) * 16 - 8))
}

const createPlanksPixel = (x: number, y: number): Rgba => {
  const base = rgba(162, 130, 78)
  const plankBand = Math.floor(y / 4)
  // Groove pixels have priority and are visibly darker
  if (y % 4 === 0 || y % 4 === 3) {
    return tint(base, -28)
  }
  let color = tint(base, plankBand % 2 === 0 ? 12 : -12)
  // Vertical grain streaks on ~1 in 5 columns
  const colHash = hash2d(x, 0, 0x4ab292)
  if ((colHash & 0x1f) < 6) {
    color = tint(color, 8)
  }
  if ((x === 2 || x === 13) && plankBand !== 1) {
    color = tint(color, -18)
  }
  return color
}

const createCobblestonePixel = (x: number, y: number): Rgba => {
  const MORTAR = rgba(75, 75, 77)
  const COLS = 3,
    ROWS = 4
  const cellW = 16 / COLS
  const cellH = 16 / ROWS

  let f1 = Infinity,
    f2 = Infinity
  let nearSeed = 0,
    nearPx = 0,
    nearPy = 0

  for (let cy = -1; cy <= ROWS; cy++) {
    for (let cx = -1; cx <= COLS; cx++) {
      const wcx = ((cx % COLS) + COLS) % COLS
      const wcy = ((cy % ROWS) + ROWS) % ROWS
      const px = (cx + 0.5 + hash2dFloat(wcx, wcy, 0x6ca4f1) * 0.7) * cellW
      const py = (cy + 0.5 + hash2dFloat(wcx, wcy, 0x4f19a3) * 0.7) * cellH
      const dx = x + 0.5 - px
      const dy = y + 0.5 - py
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < f1) {
        f2 = f1
        f1 = d
        nearSeed = hash2d(wcx, wcy, 0x9bc421)
        nearPx = px
        nearPy = py
      } else if (d < f2) {
        f2 = d
      }
    }
  }

  // Mortar where Voronoi boundary is close
  const boundary = f2 - f1
  if (boundary < 1.1) return MORTAR

  // Per-stone brightness variation ±15
  const stoneBase = 119 + ((nearSeed & 0x1f) - 15)
  const edgeShadow = Math.max(0, (2.2 - boundary) * 5)
  const centreHighlight = Math.round(blobWeight(x + 0.5, y + 0.5, nearPx, nearPy, 1.5) * 10)
  const v = clampColor(Math.round(stoneBase - edgeShadow + centreHighlight))
  return rgba(v, v, v)
}

const createBrickPixel = (x: number, y: number): Rgba => {
  const mortar = rgba(157, 150, 144)
  const brickBase = rgba(162, 66, 48)
  const row = Math.floor(y / 4)
  const offset = row % 2 === 0 ? 0 : 4
  const localX = (x + offset) % 8

  if (y % 4 === 0 || localX === 0) {
    return mortar
  }

  const noise = hash2d(x, y, 0x9f31d2)
  return tint(brickBase, ((noise & 0x7) - 3) * 4)
}

const createGlowstonePixel = (x: number, y: number): Rgba => {
  const base = rgba(223, 186, 84)
  const noise = hash2d(x, y, 0xd1e917)
  let color = tint(base, ((noise & 0x7) - 3) * 9)

  if ((x + y) % 5 === 0) {
    color = tint(color, 18)
  } else if (((noise >>> 5) & 0xf) <= 1) {
    color = tint(color, -16)
  }

  // Circular glow bloom (replaces square centre check)
  const dx = x - 7.5,
    dy = y - 7.5
  if (Math.sqrt(dx * dx + dy * dy) < 4.5) {
    color = tint(color, 14)
  }

  return color
}

const createWaterPixel = (x: number, y: number): Rgba => {
  const base = rgba(54, 108, 184, 188)
  const noise = hash2d(x, y, 0x2b8e9f)
  let color = tint(base, ((noise & 0x7) - 3) * 5)

  if (y < 3) {
    color = [clampColor(color[0] + 12), clampColor(color[1] + 18), clampColor(color[2] + 20), 176]
  } else if (((noise >>> 4) & 0xf) === 0) {
    color = [clampColor(color[0] + 8), clampColor(color[1] + 10), clampColor(color[2] + 14), 182]
  }

  return color
}

const createOrePixel = (
  x: number,
  y: number,
  seed: number,
  oreBase: Rgba,
  sparkleChanceMask: number,
): Rgba => {
  const stone = createStonePixel(x, y)

  // Cross-shaped fleck: check if pixel or any orthogonal neighbour is an ore centre
  const isCentre = (px: number, py: number): boolean =>
    ((hash2d(px, py, seed) >>> 3) & 0x1f) <= sparkleChanceMask

  if (isCentre(x, y)) {
    return [
      clampColor(oreBase[0] + 18),
      clampColor(oreBase[1] + 18),
      clampColor(oreBase[2] + 18),
      255,
    ]
  }
  if (isCentre(x - 1, y) || isCentre(x + 1, y) || isCentre(x, y - 1) || isCentre(x, y + 1)) {
    return [clampColor(oreBase[0] + 6), clampColor(oreBase[1] + 6), clampColor(oreBase[2] + 6), 255]
  }

  return stone
}

const createCoalOrePixel = (x: number, y: number): Rgba =>
  createOrePixel(x, y, 0xc01a4, rgba(60, 60, 64), 3)

const createIronOrePixel = (x: number, y: number): Rgba =>
  createOrePixel(x, y, 0x1f0a3e, rgba(209, 168, 128), 4)

const createGoldOrePixel = (x: number, y: number): Rgba =>
  createOrePixel(x, y, 0x6d01f2, rgba(255, 220, 80), 3)

const createDiamondOrePixel = (x: number, y: number): Rgba =>
  createOrePixel(x, y, 0x31dd9a, rgba(92, 230, 230), 2)

const createGlassPixel = (x: number, y: number): Rgba => {
  const isBorder = x === 0 || y === 0 || x === 15 || y === 15
  if (isBorder) {
    return rgba(195, 224, 240, 230)
  }
  const noise = hash2d(x, y, 0x3be8f1)
  const tintAmount = ((noise & 0x3) - 1) * 3
  return rgba(
    clampColor(200 + tintAmount),
    clampColor(230 + tintAmount),
    clampColor(245 + tintAmount),
    28,
  )
}

const createArmPixel = (x: number, y: number): Rgba => {
  const base = rgba(195, 155, 120)
  const noise = hash2d(x, y, 0x7a3c1e)
  return tint(base, ((noise & 0x7) - 3) * 4)
}

const DEFAULT_TILE_PIXEL_FACTORIES: Record<AtlasTileId, (x: number, y: number) => Rgba> = {
  'grass-top': createGrassTopPixel,
  'grass-side': createGrassSidePixel,
  dirt: createDirtPixel,
  stone: createStonePixel,
  bedrock: createBedrockPixel,
  'log-top': createLogTopPixel,
  'log-side': createLogSidePixel,
  leaves: createLeavesPixel,
  sand: createSandPixel,
  planks: createPlanksPixel,
  cobblestone: createCobblestonePixel,
  brick: createBrickPixel,
  glowstone: createGlowstonePixel,
  water: createWaterPixel,
  'coal-ore': createCoalOrePixel,
  'iron-ore': createIronOrePixel,
  'gold-ore': createGoldOrePixel,
  'diamond-ore': createDiamondOrePixel,
  arm: createArmPixel,
  glass: createGlassPixel,
}

export const buildDefaultVoxelTilePixels = (tileId: AtlasTileId): Uint8Array => {
  const pixels = new Uint8Array(ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4)
  const createPixel = DEFAULT_TILE_PIXEL_FACTORIES[tileId]
  for (let y = 0; y < ATLAS_TILE_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_TILE_SIZE; x += 1) {
      writePixel(pixels, x, y, ATLAS_TILE_SIZE, createPixel(x, y))
    }
  }
  return pixels
}
