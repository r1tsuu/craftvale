import type { BlockId } from "../types.ts";
import { clamp, sampleValueNoise } from "./noise.ts";

export type BiomeId = "plains" | "forest" | "highlands" | "scrub";

export interface BiomeDefinition {
  id: BiomeId;
  name: string;
  surfaceBlock: BlockId;
  fillerBlock: BlockId;
  deepBlock: BlockId;
  baseHeight: number;
  waveAmplitude: number;
  largeNoiseAmplitude: number;
  detailNoiseAmplitude: number;
  treeChancePercent: number;
  trunkHeightMin: number;
  trunkHeightVariance: number;
  canopyRadius: 1 | 2;
  targetMoisture: number;
  targetRuggedness: number;
}

export interface BiomeSample {
  biome: BiomeId;
  moisture: number;
  ruggedness: number;
  weights: Record<BiomeId, number>;
}

const createBiome = (biome: BiomeDefinition): BiomeDefinition => biome;

export const Biomes: Record<BiomeId, BiomeDefinition> = {
  plains: createBiome({
    id: "plains",
    name: "Plains",
    surfaceBlock: 1,
    fillerBlock: 2,
    deepBlock: 3,
    baseHeight: 5.8,
    waveAmplitude: 1.0,
    largeNoiseAmplitude: 0.45,
    detailNoiseAmplitude: 0.14,
    treeChancePercent: 20,
    trunkHeightMin: 3,
    trunkHeightVariance: 1,
    canopyRadius: 1,
    targetMoisture: 0.1,
    targetRuggedness: -0.3,
  }),
  forest: createBiome({
    id: "forest",
    name: "Forest",
    surfaceBlock: 1,
    fillerBlock: 2,
    deepBlock: 3,
    baseHeight: 6.4,
    waveAmplitude: 1.25,
    largeNoiseAmplitude: 0.75,
    detailNoiseAmplitude: 0.22,
    treeChancePercent: 62,
    trunkHeightMin: 3,
    trunkHeightVariance: 2,
    canopyRadius: 2,
    targetMoisture: 0.7,
    targetRuggedness: -0.1,
  }),
  highlands: createBiome({
    id: "highlands",
    name: "Highlands",
    surfaceBlock: 3,
    fillerBlock: 3,
    deepBlock: 3,
    baseHeight: 8.4,
    waveAmplitude: 1.95,
    largeNoiseAmplitude: 1.45,
    detailNoiseAmplitude: 0.36,
    treeChancePercent: 3,
    trunkHeightMin: 3,
    trunkHeightVariance: 1,
    canopyRadius: 1,
    targetMoisture: 0.0,
    targetRuggedness: 0.85,
  }),
  scrub: createBiome({
    id: "scrub",
    name: "Scrub",
    surfaceBlock: 2,
    fillerBlock: 2,
    deepBlock: 3,
    baseHeight: 4.9,
    waveAmplitude: 0.9,
    largeNoiseAmplitude: 0.35,
    detailNoiseAmplitude: 0.1,
    treeChancePercent: 5,
    trunkHeightMin: 3,
    trunkHeightVariance: 1,
    canopyRadius: 1,
    targetMoisture: -0.8,
    targetRuggedness: -0.05,
  }),
};

const BIOME_IDS = Object.keys(Biomes) as BiomeId[];

const getMoisture = (seed: number, worldX: number, worldZ: number): number =>
  clamp(
    sampleValueNoise(worldX, worldZ, seed ^ 0x6b9df6d3, 60) * 0.7 +
      sampleValueNoise(worldX, worldZ, seed ^ 0x4f9939f5, 22) * 0.3,
    -1,
    1,
  );

const getRuggedness = (seed: number, worldX: number, worldZ: number): number =>
  clamp(
    sampleValueNoise(worldX, worldZ, seed ^ 0x1247f19b, 72) * 0.68 +
      sampleValueNoise(worldX, worldZ, seed ^ 0x91e10da5, 28) * 0.32,
    -1,
    1,
  );

const scoreBiome = (
  biome: BiomeDefinition,
  moisture: number,
  ruggedness: number,
): number => {
  const moistureDistance = moisture - biome.targetMoisture;
  const ruggednessDistance = ruggedness - biome.targetRuggedness;
  const distance = Math.hypot(moistureDistance * 0.95, ruggednessDistance * 1.15);
  return Math.max(0.001, 1.45 - distance) ** 3;
};

export const sampleBiome = (seed: number, worldX: number, worldZ: number): BiomeSample => {
  const moisture = getMoisture(seed, worldX, worldZ);
  const ruggedness = getRuggedness(seed, worldX, worldZ);
  const rawWeights = BIOME_IDS.map((biomeId) => {
    const biome = Biomes[biomeId];
    return [biomeId, scoreBiome(biome, moisture, ruggedness)] as const;
  });
  const totalWeight = rawWeights.reduce((sum, [, weight]) => sum + weight, 0);

  const weights = rawWeights.reduce(
    (result, [biomeId, weight]) => {
      result[biomeId] = weight / totalWeight;
      return result;
    },
    {
      plains: 0,
      forest: 0,
      highlands: 0,
      scrub: 0,
    } satisfies Record<BiomeId, number>,
  );

  let selectedBiome = BIOME_IDS[0];
  for (const biomeId of BIOME_IDS.slice(1)) {
    if (weights[biomeId] > weights[selectedBiome]) {
      selectedBiome = biomeId;
    }
  }

  return {
    biome: selectedBiome,
    moisture,
    ruggedness,
    weights,
  };
};

export const getBiomeAt = (seed: number, worldX: number, worldZ: number): BiomeId =>
  sampleBiome(seed, worldX, worldZ).biome;
