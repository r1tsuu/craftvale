import { createLightingChunkInputFromChunk, LightingSystem } from '@craftvale/core/server'
import { parseCliFlagValue } from '@craftvale/core/shared'
import { BLOCK_IDS, CHUNK_SIZE, CHUNK_VOLUME, createGeneratedChunk } from '@craftvale/core/shared'

import type { CliBenchmark } from './types.ts'

const DEFAULT_SEED = 1337
const DEFAULT_WARMUP_ROUNDS = 20
const DEFAULT_MEASURED_ROUNDS = 140
const DEFAULT_FIXTURE_COORDS = [
  { x: -8, z: -6 },
  { x: -7, z: -2 },
  { x: -6, z: 1 },
  { x: -5, z: 5 },
  { x: -4, z: -8 },
  { x: -3, z: -3 },
  { x: -2, z: 2 },
  { x: -1, z: 7 },
  { x: 0, z: -7 },
  { x: 1, z: -4 },
  { x: 2, z: 0 },
  { x: 3, z: 4 },
  { x: 4, z: 8 },
  { x: 5, z: -5 },
  { x: 6, z: -1 },
  { x: 7, z: 3 },
] as const
const FEATURE_POINTS = [
  [4, 4],
  [7, 9],
  [11, 6],
] as const

interface LightingBuffers {
  sky: Uint8Array
  block: Uint8Array
}

interface BenchmarkResult {
  label: string
  totalMs: number
  meanMs: number
  medianMs: number
  minMs: number
  maxMs: number
}

const parsePositiveIntegerFlag = (
  argv: readonly string[],
  flagName: string,
  fallback: number,
): number => {
  const value = parseCliFlagValue(argv, flagName)
  if (value === null) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected --${flagName} to be a positive integer, got "${value}".`)
  }

  return parsed
}

const clampY = (value: number): number => Math.max(0, Math.min(255, value))

const createFixtureChunk = (coord: { x: number; z: number }, seed: number) => {
  const chunk = createGeneratedChunk(coord, seed)

  for (const [localX, localZ] of FEATURE_POINTS) {
    const columnIndex = localX + CHUNK_SIZE * localZ
    const surfaceY = chunk.heightmap[columnIndex] ?? 0
    const glowstoneY = clampY(surfaceY + 1)
    const roofY = clampY(surfaceY + 3)
    const cavityY = clampY(surfaceY + 2)

    chunk.set(localX, glowstoneY, localZ, BLOCK_IDS.glowstone)
    if (localX + 1 < CHUNK_SIZE) {
      chunk.set(localX + 1, roofY, localZ, BLOCK_IDS.grass)
      chunk.set(localX + 1, cavityY, localZ, BLOCK_IDS.air)
    }
    if (localZ + 1 < CHUNK_SIZE) {
      chunk.set(localX, clampY(surfaceY + 1), localZ + 1, BLOCK_IDS.glass)
    }
  }

  chunk.dirtyLight = true
  return chunk
}

const createBuffers = (count: number): LightingBuffers[] =>
  Array.from({ length: count }, () => ({
    sky: new Uint8Array(CHUNK_VOLUME),
    block: new Uint8Array(CHUNK_VOLUME),
  }))

const measure = (
  label: string,
  runRound: () => void,
  warmupRounds: number,
  measuredRounds: number,
): BenchmarkResult => {
  for (let round = 0; round < warmupRounds; round += 1) {
    runRound()
  }

  const samples: number[] = []
  for (let round = 0; round < measuredRounds; round += 1) {
    const startedAt = performance.now()
    runRound()
    samples.push(performance.now() - startedAt)
  }

  const totalMs = samples.reduce((sum, value) => sum + value, 0)
  const meanMs = totalMs / samples.length
  const sorted = [...samples].sort((left, right) => left - right)
  const medianMs = sorted[Math.floor(sorted.length / 2)] ?? 0
  const minMs = sorted[0] ?? 0
  const maxMs = sorted[sorted.length - 1] ?? 0

  return {
    label,
    totalMs,
    meanMs,
    medianMs,
    minMs,
    maxMs,
  }
}

const formatMs = (value: number): string => `${value.toFixed(3)} ms`

const runLightingBenchmark = (argv: readonly string[]): void => {
  const warmupRounds = parsePositiveIntegerFlag(argv, 'warmup', DEFAULT_WARMUP_ROUNDS)
  const measuredRounds = parsePositiveIntegerFlag(argv, 'rounds', DEFAULT_MEASURED_ROUNDS)
  const seed = parsePositiveIntegerFlag(argv, 'seed', DEFAULT_SEED)
  const fixtureCount = parsePositiveIntegerFlag(argv, 'fixtures', DEFAULT_FIXTURE_COORDS.length)
  const fixtureCoords = DEFAULT_FIXTURE_COORDS.slice(0, fixtureCount)
  if (fixtureCoords.length === 0) {
    throw new Error('Lighting benchmark requires at least one fixture chunk.')
  }

  const fixtureChunks = fixtureCoords.map((coord) => createFixtureChunk(coord, seed))
  const fixtureInputs = fixtureChunks.map((chunk) => createLightingChunkInputFromChunk(chunk))
  const nativeBuffers = createBuffers(fixtureChunks.length)
  const nativeLighting = new LightingSystem()

  const runNativeRound = (): void => {
    for (let index = 0; index < fixtureInputs.length; index += 1) {
      const chunk = fixtureInputs[index]!
      const buffers = nativeBuffers[index]!
      buffers.sky.fill(0)
      buffers.block.fill(0)
      nativeLighting.relightChunk(chunk, buffers)
    }
  }

  runNativeRound()

  const native = measure('native', runNativeRound, warmupRounds, measuredRounds)
  const perChunkNativeMs = native.meanMs / fixtureChunks.length

  console.log('Lighting benchmark')
  console.log(
    `Fixture: ${fixtureChunks.length} generated chunks, seed ${seed}, ${warmupRounds} warmup round(s), ${measuredRounds} measured round(s)`,
  )
  console.log(`Native mean: ${formatMs(native.meanMs)} (${formatMs(perChunkNativeMs)} per chunk)`)
  console.log(
    `Native range: ${formatMs(native.minMs)} min / ${formatMs(native.medianMs)} median / ${formatMs(native.maxMs)} max`,
  )
}

export const lightingBenchmark: CliBenchmark = {
  name: 'lighting',
  description: 'Measure native chunk relight throughput on deterministic generated chunk fixtures.',
  run: runLightingBenchmark,
}
