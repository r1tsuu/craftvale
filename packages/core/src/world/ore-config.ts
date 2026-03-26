import type { BlockKey } from './generated/content-ids.ts'

export interface OreGenerationConfig {
  blockKey: BlockKey
  minY: number
  maxY: number
  attemptsPerChunk: number
  veinSizeMin: number
  veinSizeMax: number
}

export const ORE_GENERATION_CONFIGS = [
  {
    blockKey: 'coalOre',
    minY: 24,
    maxY: 192,
    attemptsPerChunk: 24,
    veinSizeMin: 6,
    veinSizeMax: 14,
  },
  {
    blockKey: 'ironOre',
    minY: 16,
    maxY: 128,
    attemptsPerChunk: 18,
    veinSizeMin: 4,
    veinSizeMax: 10,
  },
  {
    blockKey: 'goldOre',
    minY: 8,
    maxY: 64,
    attemptsPerChunk: 10,
    veinSizeMin: 3,
    veinSizeMax: 7,
  },
  {
    blockKey: 'diamondOre',
    minY: 4,
    maxY: 24,
    attemptsPerChunk: 7,
    veinSizeMin: 2,
    veinSizeMax: 5,
  },
] as const satisfies readonly OreGenerationConfig[]
