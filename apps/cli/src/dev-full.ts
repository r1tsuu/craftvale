import {
  createLogger,
  ensurePortAvailable,
  forceReleasePort,
  parseClientDir,
  parseServerDir,
} from '@craftvale/core/shared'

import { clientAppRoot, projectRoot, serverAppRoot } from './paths.ts'

const SERVER_PORT = 3210
const SERVER_ADDRESS = `127.0.0.1:${SERVER_PORT}`
const SERVER_SHUTDOWN_TIMEOUT_MS = 3_000
const SERVER_READY_TIMEOUT_MS = 5_000
const SERVER_READY_POLL_INTERVAL_MS = 100
const bunExecutable = Bun.which('bun') ?? process.execPath
const devFullLogger = createLogger('dev:full', 'yellow')

const spawnRuntimeProcess = (
  entryPath: string,
  options: {
    stdin: 'ignore' | 'inherit'
    env: Record<string, string | undefined>
    extraArgs?: string[]
  },
): Bun.Subprocess => {
  return Bun.spawn([bunExecutable, entryPath, ...(options.extraArgs ?? [])], {
    cwd: projectRoot,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: options.stdin,
    env: options.env,
  })
}

const logInfo = (message: string): void => {
  devFullLogger.info(message)
}

const argv = Bun.argv.slice(2)
const clientDir = parseClientDir(argv, clientAppRoot)
const serverDir = parseServerDir(argv, serverAppRoot)
const clientRuntimeArgs = clientDir ? [`--client-dir=${clientDir}`] : []
const serverRuntimeArgs = serverDir ? [`--server-dir=${serverDir}`] : []

const waitForServerReady = async (
  process: Bun.Subprocess,
  address: string,
  timeoutMs: number,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  const url = `ws://${address}/ws`
  logInfo(`waiting for dedicated server readiness at ${url}`)

  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Dedicated server exited before becoming ready (code ${process.exitCode}).`)
    }

    const ready = await new Promise<boolean>((resolve) => {
      const socket = new WebSocket(url)
      let settled = false

      const finish = (value: boolean): void => {
        if (settled) {
          return
        }

        settled = true
        try {
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close()
          }
        } catch {
          // Ignore close errors during readiness probing.
        }
        resolve(value)
      }

      socket.addEventListener(
        'open',
        () => {
          finish(true)
        },
        { once: true },
      )
      socket.addEventListener(
        'error',
        () => {
          finish(false)
        },
        { once: true },
      )
      setTimeout(() => {
        finish(false)
      }, SERVER_READY_POLL_INTERVAL_MS)
    })

    if (ready) {
      logInfo(`dedicated server accepted a WebSocket connection at ${url}`)
      return
    }

    await Bun.sleep(SERVER_READY_POLL_INTERVAL_MS)
  }

  throw new Error(`Timed out waiting for dedicated server readiness at ${url}.`)
}

logInfo(`ensuring port ${SERVER_PORT} is available`)
await ensurePortAvailable(SERVER_PORT)

logInfo(`spawning dedicated server on port ${SERVER_PORT}`)
const server = spawnRuntimeProcess(`${serverAppRoot}/src/index.ts`, {
  stdin: 'ignore',
  extraArgs: [...serverRuntimeArgs, `--port=${SERVER_PORT}`],
  env: {
    ...Bun.env,
    APP_ENV: 'development',
  },
})

await waitForServerReady(server, SERVER_ADDRESS, SERVER_READY_TIMEOUT_MS)

logInfo('spawning desktop client')
const client = spawnRuntimeProcess(`${clientAppRoot}/src/index.ts`, {
  stdin: 'inherit',
  extraArgs: clientRuntimeArgs,
  env: {
    ...Bun.env,
    APP_ENV: 'development',
  },
})

let shutdownStarted = false

const waitForExitOrTimeout = async (
  process: Bun.Subprocess,
  timeoutMs: number,
): Promise<boolean> => {
  const result = await Promise.race([
    process.exited.then(() => 'exited' as const),
    Bun.sleep(timeoutMs).then(() => 'timeout' as const),
  ])
  return result === 'exited'
}

const shutdown = async (): Promise<void> => {
  if (shutdownStarted) {
    logInfo('shutdown already in progress')
    return
  }

  shutdownStarted = true
  logInfo('starting coordinated shutdown')

  if (!client.killed) {
    logInfo('sending SIGTERM to desktop client')
    client.kill('SIGTERM')
    const clientExitedGracefully = await waitForExitOrTimeout(client, 500)
    logInfo(
      clientExitedGracefully
        ? `desktop client exited with code ${client.exitCode}`
        : 'desktop client did not exit before timeout',
    )
  }

  if (!server.killed) {
    logInfo('sending SIGTERM to dedicated server')
    server.kill('SIGTERM')
    const exitedGracefully = await waitForExitOrTimeout(server, SERVER_SHUTDOWN_TIMEOUT_MS)
    logInfo(
      exitedGracefully
        ? `dedicated server exited with code ${server.exitCode}`
        : `dedicated server did not exit within ${SERVER_SHUTDOWN_TIMEOUT_MS}ms`,
    )
    if (!exitedGracefully && !server.killed) {
      logInfo('sending SIGKILL to dedicated server')
      server.kill('SIGKILL')
      await server.exited
      logInfo(`dedicated server exited with code ${server.exitCode} after SIGKILL`)
    }
  }

  const releasedPids = await forceReleasePort(SERVER_PORT)
  if (releasedPids.length > 0) {
    logInfo(`force-released port ${SERVER_PORT} by terminating PID(s) ${releasedPids.join(', ')}`)
  } else {
    logInfo(`confirmed port ${SERVER_PORT} is free`)
  }
}

process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0))
})

process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0))
})

const exitCode = await client.exited
logInfo(`desktop client process exited with code ${exitCode}`)
await shutdown()
logInfo(`dev-full exiting with code ${exitCode}`)
process.exit(exitCode)

export {}
