export interface CliBenchmark {
  name: string
  description: string
  run(argv: readonly string[]): Promise<void> | void
}
