import type { CliBenchmark } from './benchmarks/types.ts'

import { lightingBenchmark } from './benchmarks/lighting.ts'
import { worldgenBenchmark } from './benchmarks/worldgen.ts'

const benchmarks: readonly CliBenchmark[] = [lightingBenchmark, worldgenBenchmark]

const argv = Bun.argv.slice(2)
const requestedName = argv[0] && !argv[0].startsWith('--') ? argv[0] : null
const benchmarkArgs = requestedName ? argv.slice(1) : argv

const selectedBenchmarks = requestedName
  ? benchmarks.filter((benchmark) => benchmark.name === requestedName)
  : benchmarks

if (selectedBenchmarks.length === 0) {
  throw new Error(
    `Unknown benchmark "${requestedName}". Available benchmarks: ${benchmarks.map((benchmark) => benchmark.name).join(', ')}`,
  )
}

if (selectedBenchmarks.length > 1) {
  console.log(
    `Running ${selectedBenchmarks.length} benchmarks: ${selectedBenchmarks.map((benchmark) => benchmark.name).join(', ')}`,
  )
} else {
  console.log(`Running benchmark: ${selectedBenchmarks[0]!.name}`)
}

for (let index = 0; index < selectedBenchmarks.length; index += 1) {
  const benchmark = selectedBenchmarks[index]!
  if (index > 0) {
    console.log('')
  }

  console.log(`[${benchmark.name}] ${benchmark.description}`)
  await benchmark.run(benchmarkArgs)
}
