import type { BlockId } from '../types.ts'

import { BLOCK_IDS } from './blocks.ts'
import { clamp, sampleValueNoise } from './noise.ts'

export type BiomeId = 'plains' | 'forest' | 'highlands' | 'scrub'

export interface BiomeDefinition {
  id: BiomeId
  name: string
  surfaceBlock: BlockId
  fillerBlock: BlockId
  deepBlock: BlockId
  baseHeight: number
  waveAmplitude: number
  largeNoiseAmplitude: number
  detailNoiseAmplitude: number
  treeChancePercent: number
  trunkHeightMin: number
  trunkHeightVariance: number
  canopyRadiusBase: number
  canopyRadiusVariance: number
  targetMoisture: number
  targetRuggedness: number
}

export interface BiomeSample {
  biome: BiomeId
  moisture: number
  ruggedness: number
  weights: Record<BiomeId, number>
}

const createBiome = (biome: BiomeDefinition): BiomeDefinition => biome

export const Biomes: Record<BiomeId, BiomeDefinition> = {
  plains: createBiome({
    id: 'plains',
    name: 'Plains',
    surfaceBlock: BLOCK_IDS.grass,
    fillerBlock: BLOCK_IDS.dirt,
    deepBlock: BLOCK_IDS.stone,
    baseHeight: 69,
    waveAmplitude: 3.6,
    largeNoiseAmplitude: 7,
    detailNoiseAmplitude: 1.2,
    treeChancePercent: 20,
    trunkHeightMin: 4,
    trunkHeightVariance: 2,
    canopyRadiusBase: 2,
    canopyRadiusVariance: 0,
    targetMoisture: 0.1,
    targetRuggedness: -0.3,
  }),
  forest: createBiome({
    id: 'forest',
    name: 'Forest',
    surfaceBlock: BLOCK_IDS.grass,
    fillerBlock: BLOCK_IDS.dirt,
    deepBlock: BLOCK_IDS.stone,
    baseHeight: 73,
    waveAmplitude: 4.4,
    largeNoiseAmplitude: 9.5,
    detailNoiseAmplitude: 1.7,
    treeChancePercent: 62,
    trunkHeightMin: 4,
    trunkHeightVariance: 3,
    canopyRadiusBase: 2,
    canopyRadiusVariance: 1,
    targetMoisture: 0.7,
    targetRuggedness: -0.1,
  }),
  highlands: createBiome({
    id: 'highlands',
    name: 'Highlands',
    surfaceBlock: BLOCK_IDS.stone,
    fillerBlock: BLOCK_IDS.stone,
    deepBlock: BLOCK_IDS.stone,
    baseHeight: 104,
    waveAmplitude: 6,
    largeNoiseAmplitude: 20,
    detailNoiseAmplitude: 2.5,
    treeChancePercent: 3,
    trunkHeightMin: 3,
    trunkHeightVariance: 1,
    canopyRadiusBase: 1,
    canopyRadiusVariance: 0,
    targetMoisture: 0.0,
    targetRuggedness: 0.85,
  }),
  scrub: createBiome({
    id: 'scrub',
    name: 'Scrub',
    surfaceBlock: BLOCK_IDS.dirt,
    fillerBlock: BLOCK_IDS.dirt,
    deepBlock: BLOCK_IDS.stone,
    baseHeight: 60,
    waveAmplitude: 3.1,
    largeNoiseAmplitude: 6.5,
    detailNoiseAmplitude: 1,
    treeChancePercent: 5,
    trunkHeightMin: 3,
    trunkHeightVariance: 1,
    canopyRadiusBase: 1,
    canopyRadiusVariance: 0,
    targetMoisture: -0.8,
    targetRuggedness: -0.05,
  }),
}

const BIOME_IDS = Object.keys(Biomes) as BiomeId[]

const getMoisture = (seed: number, worldX: number, worldZ: number): number =>
  clamp(
    sampleValueNoise(worldX, worldZ, seed ^ 0x6b9df6d3, 180) * 0.74 +
      sampleValueNoise(worldX, worldZ, seed ^ 0x4f9939f5, 72) * 0.26,
    -1,
    1,
  )

const getRuggedness = (seed: number, worldX: number, worldZ: number): number =>
  clamp(
    sampleValueNoise(worldX, worldZ, seed ^ 0x1247f19b, 220) * 0.7 +
      sampleValueNoise(worldX, worldZ, seed ^ 0x91e10da5, 88) * 0.3,
    -1,
    1,
  )

const scoreBiome = (biome: BiomeDefinition, moisture: number, ruggedness: number): number => {
  const moistureDistance = moisture - biome.targetMoisture
  const ruggednessDistance = ruggedness - biome.targetRuggedness
  const distance = Math.hypot(moistureDistance * 0.95, ruggednessDistance * 1.15)
  return Math.max(0.001, 1.45 - distance) ** 3
}

export const sampleBiome = (seed: number, worldX: number, worldZ: number): BiomeSample => {
  const moisture = getMoisture(seed, worldX, worldZ)
  const ruggedness = getRuggedness(seed, worldX, worldZ)
  const rawWeights = BIOME_IDS.map((biomeId) => {
    const biome = Biomes[biomeId]
    return [biomeId, scoreBiome(biome, moisture, ruggedness)] as const
  })
  const totalWeight = rawWeights.reduce((sum, [, weight]) => sum + weight, 0)

  const weights = rawWeights.reduce(
    (result, [biomeId, weight]) => {
      result[biomeId] = weight / totalWeight
      return result
    },
    {
      plains: 0,
      forest: 0,
      highlands: 0,
      scrub: 0,
    } satisfies Record<BiomeId, number>,
  )

  let selectedBiome = BIOME_IDS[0]
  for (const biomeId of BIOME_IDS.slice(1)) {
    if (weights[biomeId] > weights[selectedBiome]) {
      selectedBiome = biomeId
    }
  }

  return {
    biome: selectedBiome,
    moisture,
    ruggedness,
    weights,
  }
}

export const getBiomeAt = (seed: number, worldX: number, worldZ: number): BiomeId =>
  sampleBiome(seed, worldX, worldZ).biome
