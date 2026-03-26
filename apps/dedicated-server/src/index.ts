import {
  createLogger,
  ensurePortAvailable,
  parseCliFlagValue,
  parseServerDir,
} from '@craftvale/core/shared'

import { DedicatedServer, DEFAULT_DEDICATED_SERVER_PORT } from './dedicated-server.ts'

const serverLogger = createLogger('server', 'magenta')

const parsePort = (argv: readonly string[]): number | undefined => {
  const value = parseCliFlagValue(argv, 'port')
  if (value === null) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid port "${value}".`)
  }

  return Math.trunc(parsed)
}

const argv = Bun.argv.slice(2)
const port = parsePort(argv) ?? DEFAULT_DEDICATED_SERVER_PORT
const appRoot = import.meta.dir.endsWith('/apps/dedicated-server/src')
  ? import.meta.dir.slice(0, -'/src'.length)
  : import.meta.dir
const storageRoot = parseServerDir(argv, appRoot)
serverLogger.info(`starting dedicated server on port ${port}...`)
await ensurePortAvailable(port)
const server = await DedicatedServer.start({ port, storageRoot })

server.logInfo(
  `started on ws://127.0.0.1:${server.socketServer.port}/ws for world "${server.world.summary.name}" (seed ${server.world.summary.seed})`,
)

const shutdown = async (): Promise<void> => {
  server.logInfo('shutting down')
  await server.shutdown()
  process.exit(0)
}

process.on('SIGINT', () => {
  void shutdown()
})

process.on('SIGTERM', () => {
  void shutdown()
})
