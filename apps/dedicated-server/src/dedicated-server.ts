import {
  AuthoritativeWorld,
  DedicatedWorldStorage,
  PortServerAdapter,
  ServerRuntime,
  WorldSessionController,
  type WorldSessionPeer,
  type WorldStorage,
} from '@craftvale/core/server'
import {
  type ClientToServerMessage,
  createLogger,
  decodeClientToServerMessage,
  encodeTransportMessage,
  type ServerToClientMessage,
  type TransportPort,
} from '@craftvale/core/shared'
import { join } from 'node:path'

const appRoot = import.meta.dir.endsWith('/apps/dedicated-server/src')
  ? import.meta.dir.slice(0, -'/src'.length)
  : import.meta.dir

export const DEFAULT_DEDICATED_SERVER_PORT = 3210
export const DEFAULT_DEDICATED_WORLD_NAME = 'Server World'
export const DEFAULT_DEDICATED_STORAGE_ROOT = join(appRoot, 'dist')
const serverLogger = createLogger('server', 'magenta')

interface DedicatedSocketData {
  session: DedicatedServerSession | null
}

export interface DedicatedServerSessionHost {
  readonly world: AuthoritativeWorld
  readonly runtime: ServerRuntime
  readonly contextLabel: string
  logInfo?(message: string): void
}

export const loadOrCreateDedicatedWorld = async (
  storage: WorldStorage,
  options: {
    worldName?: string
    seed?: number
  } = {},
): Promise<AuthoritativeWorld> => {
  const worldName = options.worldName?.trim() || DEFAULT_DEDICATED_WORLD_NAME
  const seed = options.seed ?? (Date.now() ^ 0x9e3779b9) >>> 0
  const existingWorldSummary = (await storage.listWorlds())[0] ?? null
  const storedWorld =
    (existingWorldSummary
      ? await storage.getWorld(existingWorldSummary.name)
      : await storage.createWorld(worldName, seed)) ?? (await storage.createWorld(worldName, seed))
  return new AuthoritativeWorld(storedWorld, storage)
}

class DedicatedServerTransport implements TransportPort<
  ClientToServerMessage,
  ServerToClientMessage
> {
  private messageHandler: ((message: ClientToServerMessage) => void) | null = null

  public constructor(private readonly socket: Bun.ServerWebSocket<DedicatedSocketData>) {}

  public postMessage(message: ServerToClientMessage): void {
    this.socket.send(encodeTransportMessage(message))
  }

  public setMessageHandler(handler: (message: ClientToServerMessage) => void): void {
    this.messageHandler = handler
  }

  public handleEncodedMessage(encoded: string): void {
    this.messageHandler?.(decodeClientToServerMessage(encoded))
  }

  public close(): void {
    this.socket.close()
  }
}

export class DedicatedServerSession implements WorldSessionPeer {
  private readonly transport: DedicatedServerTransport
  private readonly adapter: PortServerAdapter
  private readonly controller: WorldSessionController
  private readonly unregisterJoinServer: () => void
  private joinedPlayerName: string | null = null
  private disconnected = false

  public constructor(
    private readonly server: DedicatedServer & DedicatedServerSessionHost,
    socket: Bun.ServerWebSocket<DedicatedSocketData>,
    private readonly sessionId: number,
  ) {
    this.transport = new DedicatedServerTransport(socket)
    this.adapter = new PortServerAdapter(this.transport)

    const controllerRef: { current: WorldSessionController | null } = { current: null }
    const controller = new WorldSessionController(
      {
        contextLabel: server.contextLabel,
        getWorld: () => server.world,
        allocateIntentSequence: () => server.runtime.allocateIntentSequence(),
        sendToPlayer: (playerEntityId, message) => {
          server.runtime.sendToPlayer(playerEntityId, message)
        },
        broadcast: (message, options) => {
          server.runtime.broadcast(message, options)
        },
        afterJoin: (player) => {
          const activeController = controllerRef.current
          if (!activeController) {
            return
          }
          server.runtime.broadcast(
            {
              type: 'playerJoined',
              payload: { player },
            },
            { exclude: activeController },
          )
        },
        afterLeave: (player) => {
          const activeController = controllerRef.current
          if (!activeController) {
            return
          }
          server.runtime.broadcast(
            {
              type: 'playerLeft',
              payload: {
                playerEntityId: player.entityId,
                playerName: player.name,
              },
            },
            { exclude: activeController },
          )
        },
      },
      this.adapter,
    )
    controllerRef.current = controller
    this.controller = controller
    this.server.runtime.registerSession(this.controller)
    this.unregisterJoinServer = this.adapter.eventBus.on('joinServer', async ({ playerName }) => {
      const payload = await this.controller.join(playerName)
      this.joinedPlayerName = playerName
      this.server.logInfo?.(`[session ${this.sessionId}] player joined: ${playerName}`)
      return payload
    })
    this.server.registerSession(this)
    this.server.logInfo?.(`[session ${this.sessionId}] client connected`)
  }

  public handleEncodedMessage(encoded: string): void {
    this.transport.handleEncodedMessage(encoded)
  }

  public sendEvent(message: Parameters<WorldSessionPeer['sendEvent']>[0]): void {
    this.controller.sendEvent(message)
  }

  public controlsPlayer(entityId: Parameters<WorldSessionPeer['controlsPlayer']>[0]): boolean {
    return this.controller.controlsPlayer(entityId)
  }

  public async disconnect(closeTransport = false): Promise<void> {
    if (this.disconnected) {
      return
    }

    this.disconnected = true
    await this.controller.disconnect(closeTransport)
    if (this.joinedPlayerName) {
      this.server.logInfo?.(
        `[session ${this.sessionId}] player disconnected: ${this.joinedPlayerName}`,
      )
    } else {
      this.server.logInfo?.(`[session ${this.sessionId}] client disconnected`)
    }
    this.unregisterJoinServer()
    this.server.runtime.unregisterSession(this.controller)
    this.controller.dispose()
    this.server.unregisterSession(this)
  }
}

export class DedicatedServer implements DedicatedServerSessionHost {
  private readonly sessions = new Set<DedicatedServerSession>()
  private nextSessionId = 1

  private constructor(
    public readonly world: AuthoritativeWorld,
    public readonly runtime: ServerRuntime,
    public readonly storage: WorldStorage,
    public readonly socketServer: Bun.Server<DedicatedSocketData>,
  ) {}

  public get contextLabel(): string {
    return 'server'
  }

  public logInfo(message: string): void {
    serverLogger.info(message)
  }

  public static async start(
    options: {
      port?: number
      worldName?: string
      seed?: number
      storageRoot?: string
      tickIntervalMs?: number
    } = {},
  ): Promise<DedicatedServer> {
    const storage = new DedicatedWorldStorage(options.storageRoot ?? DEFAULT_DEDICATED_STORAGE_ROOT)
    const world = await loadOrCreateDedicatedWorld(storage, options)
    const runtime = new ServerRuntime(null, world, {
      logInfo: (message) => serverLogger.info(message),
      tickIntervalMs: options.tickIntervalMs,
    })

    let instance: DedicatedServer | null = null
    const socketServer = Bun.serve<DedicatedSocketData>({
      port: options.port ?? DEFAULT_DEDICATED_SERVER_PORT,
      fetch(request, server) {
        const url = new URL(request.url)
        if (url.pathname !== '/ws') {
          return new Response('Not found.', { status: 404 })
        }

        const upgraded = server.upgrade(request, {
          data: {
            session: null,
          },
        })
        if (!upgraded) {
          return new Response('WebSocket upgrade failed.', { status: 400 })
        }

        return
      },
      websocket: {
        data: {} as DedicatedSocketData,
        open(ws) {
          ws.data.session = new DedicatedServerSession(instance!, ws, instance!.allocateSessionId())
        },
        message(ws, message) {
          if (typeof message !== 'string') {
            return
          }

          ws.data.session?.handleEncodedMessage(message)
        },
        close(ws) {
          const session = ws.data.session
          ws.data.session = null
          if (session) {
            void session.disconnect(false)
          }
        },
      },
    })

    instance = new DedicatedServer(world, runtime, storage, socketServer)
    return instance
  }

  public registerSession(session: DedicatedServerSession): void {
    this.sessions.add(session)
  }

  public unregisterSession(session: DedicatedServerSession): void {
    this.sessions.delete(session)
  }

  private allocateSessionId(): number {
    const sessionId = this.nextSessionId
    this.nextSessionId += 1
    return sessionId
  }

  public async shutdown(): Promise<void> {
    for (const session of [...this.sessions]) {
      await session.disconnect(true)
    }

    await this.runtime.shutdown()
    this.socketServer.stop(true)
  }
}
