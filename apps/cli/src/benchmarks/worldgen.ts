import { parseCliFlagValue } from '@craftvale/core/shared'
import { CHUNK_SIZE, createGeneratedChunk, getTerrainHeight } from '@craftvale/core/shared'

import type { CliBenchmark } from './types.ts'

const DEFAULT_SEED = 1337
const DEFAULT_WARMUP_ROUNDS = 10
const DEFAULT_MEASURED_ROUNDS = 60
const DEFAULT_FIXTURE_COORDS = [
  { x: -8, z: -8 },
  { x: -8, z: -4 },
  { x: -8, z: 0 },
  { x: -8, z: 4 },
  { x: -4, z: -8 },
  { x: -4, z: -4 },
  { x: -4, z: 0 },
  { x: -4, z: 4 },
  { x: 0, z: -8 },
  { x: 0, z: -4 },
  { x: 0, z: 0 },
  { x: 0, z: 4 },
  { x: 4, z: -8 },
  { x: 4, z: -4 },
  { x: 4, z: 0 },
  { x: 4, z: 4 },
] as const

interface BenchmarkResult {
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

const measure = (
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
  const sorted = [...samples].sort((left, right) => left - right)

  return {
    meanMs: totalMs / samples.length,
    medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  }
}

const formatMs = (value: number): string => `${value.toFixed(3)} ms`

const runWorldgenBenchmark = (argv: readonly string[]): void => {
  const warmupRounds = parsePositiveIntegerFlag(argv, 'warmup', DEFAULT_WARMUP_ROUNDS)
  const measuredRounds = parsePositiveIntegerFlag(argv, 'rounds', DEFAULT_MEASURED_ROUNDS)
  const seed = parsePositiveIntegerFlag(argv, 'seed', DEFAULT_SEED)
  const fixtureCount = parsePositiveIntegerFlag(argv, 'fixtures', DEFAULT_FIXTURE_COORDS.length)
  const fixtureCoords = DEFAULT_FIXTURE_COORDS.slice(0, fixtureCount)
  if (fixtureCoords.length === 0) {
    throw new Error('Worldgen benchmark requires at least one fixture chunk.')
  }

  let lastHeightChecksum = 0
  const runHeightSamplingRound = (): void => {
    let checksum = 0
    for (const coord of fixtureCoords) {
      const originX = coord.x * CHUNK_SIZE
      const originZ = coord.z * CHUNK_SIZE
      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
          checksum += getTerrainHeight(seed, originX + localX, originZ + localZ)
        }
      }
    }
    lastHeightChecksum = checksum
  }

  let lastChunkChecksum = 0
  const runChunkGenerationRound = (): void => {
    let checksum = 0
    for (const coord of fixtureCoords) {
      const chunk = createGeneratedChunk(coord, seed)
      checksum += chunk.heightmap[0] ?? 0
      checksum += chunk.heightmap[chunk.heightmap.length - 1] ?? 0
      checksum += chunk.blocks[0] ?? 0
      checksum += chunk.blocks[chunk.blocks.length - 1] ?? 0
    }
    lastChunkChecksum = checksum
  }

  runHeightSamplingRound()
  runChunkGenerationRound()

  const heightSampling = measure(runHeightSamplingRound, warmupRounds, measuredRounds)
  const chunkGeneration = measure(runChunkGenerationRound, warmupRounds, measuredRounds)
  const perChunkHeightSamplingMs = heightSampling.meanMs / fixtureCoords.length
  const perChunkGenerationMs = chunkGeneration.meanMs / fixtureCoords.length
  const nonHeightGenerationMs = Math.max(0, chunkGeneration.meanMs - heightSampling.meanMs)

  console.log('Worldgen benchmark')
  console.log(
    `Fixture: ${fixtureCoords.length} generated chunks, seed ${seed}, ${warmupRounds} warmup round(s), ${measuredRounds} measured round(s)`,
  )
  console.log(
    `Height sampling mean: ${formatMs(heightSampling.meanMs)} (${formatMs(perChunkHeightSamplingMs)} per chunk)`,
  )
  console.log(
    `Height sampling range: ${formatMs(heightSampling.minMs)} min / ${formatMs(heightSampling.medianMs)} median / ${formatMs(heightSampling.maxMs)} max`,
  )
  console.log(
    `Full chunk generation mean: ${formatMs(chunkGeneration.meanMs)} (${formatMs(perChunkGenerationMs)} per chunk)`,
  )
  console.log(
    `Full chunk generation range: ${formatMs(chunkGeneration.minMs)} min / ${formatMs(chunkGeneration.medianMs)} median / ${formatMs(chunkGeneration.maxMs)} max`,
  )
  console.log(`Estimated non-height work: ${formatMs(nonHeightGenerationMs)} per round`)
  console.log(`Height checksum: ${lastHeightChecksum}`)
  console.log(`Chunk checksum: ${lastChunkChecksum}`)
}

export const worldgenBenchmark: CliBenchmark = {
  name: 'worldgen',
  description:
    'Measure deterministic terrain-height sampling and full chunk generation throughput on a fixed chunk fixture set.',
  run: runWorldgenBenchmark,
}
