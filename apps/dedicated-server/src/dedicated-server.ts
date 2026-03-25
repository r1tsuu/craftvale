import { join } from "node:path";
import {
  AuthoritativeWorld,
  DedicatedWorldStorage,
  PortServerAdapter,
  WorldSessionController,
  type WorldStorage,
  type WorldSessionPeer,
} from "@voxel/core/server";
import {
  createLogger,
  decodeClientToServerMessage,
  encodeTransportMessage,
  type ClientToServerMessage,
  type EntityId,
  type PlayerSnapshot,
  type ServerEventMap,
  type ServerToClientMessage,
  type TransportPort,
} from "@voxel/core/shared";

const appRoot = import.meta.dir.endsWith("/apps/dedicated-server/src")
  ? import.meta.dir.slice(0, -"/src".length)
  : import.meta.dir;
const projectRoot = appRoot.endsWith("/apps/dedicated-server")
  ? appRoot.slice(0, -"/apps/dedicated-server".length)
  : appRoot;

export const DEFAULT_DEDICATED_SERVER_PORT = 3210;
export const DEFAULT_DEDICATED_WORLD_NAME = "Server World";
export const DEFAULT_DEDICATED_STORAGE_ROOT = join(projectRoot, "server");
const serverLogger = createLogger("server", "magenta");

interface DedicatedSocketData {
  session: DedicatedServerSession | null;
}

export interface DedicatedServerSessionHost {
  readonly world: AuthoritativeWorld;
  readonly contextLabel: string;
  registerSession(session: WorldSessionPeer): void;
  unregisterSession(session: WorldSessionPeer): void;
  logInfo?(message: string): void;
  sendToPlayer<K extends keyof ServerEventMap>(
    playerEntityId: EntityId,
    message: {
      type: K;
      payload: ServerEventMap[K];
    },
  ): void;
  broadcast<K extends keyof ServerEventMap>(
    message: {
      type: K;
      payload: ServerEventMap[K];
    },
    options?: {
      exclude?: WorldSessionPeer;
    },
  ): void;
}

export const loadOrCreateDedicatedWorld = async (
  storage: WorldStorage,
  options: {
    worldName?: string;
    seed?: number;
  } = {},
): Promise<AuthoritativeWorld> => {
  const worldName = options.worldName?.trim() || DEFAULT_DEDICATED_WORLD_NAME;
  const seed = options.seed ?? ((Date.now() ^ 0x9e3779b9) >>> 0);
  const existingWorldSummary = (await storage.listWorlds())[0] ?? null;
  const storedWorld =
    (existingWorldSummary
      ? await storage.getWorld(existingWorldSummary.name)
      : await storage.createWorld(worldName, seed)) ?? await storage.createWorld(worldName, seed);
  return new AuthoritativeWorld(storedWorld, storage);
};

class DedicatedServerTransport implements TransportPort<ClientToServerMessage, ServerToClientMessage> {
  private messageHandler: ((message: ClientToServerMessage) => void) | null = null;

  public constructor(private readonly socket: Bun.ServerWebSocket<DedicatedSocketData>) {}

  public postMessage(message: ServerToClientMessage): void {
    this.socket.send(encodeTransportMessage(message));
  }

  public setMessageHandler(
    handler: (message: ClientToServerMessage) => void,
  ): void {
    this.messageHandler = handler;
  }

  public handleEncodedMessage(encoded: string): void {
    this.messageHandler?.(decodeClientToServerMessage(encoded));
  }

  public close(): void {
    this.socket.close();
  }
}

export class DedicatedServerSession implements WorldSessionPeer {
  private readonly transport: DedicatedServerTransport;
  private readonly adapter: PortServerAdapter;
  private readonly controller: WorldSessionController;
  private readonly unregisterJoinServer: () => void;
  private joinedPlayerName: string | null = null;

  public constructor(
    private readonly server: DedicatedServerSessionHost,
    socket: Bun.ServerWebSocket<DedicatedSocketData>,
    private readonly sessionId: number,
  ) {
    this.transport = new DedicatedServerTransport(socket);
    this.adapter = new PortServerAdapter(this.transport);
    this.controller = new WorldSessionController(
      {
        contextLabel: server.contextLabel,
        getWorld: () => server.world,
        sendToPlayer: (playerEntityId, message) => {
          server.sendToPlayer(playerEntityId, message);
        },
        broadcast: (message, options) => {
          server.broadcast(message, options);
        },
        afterJoin: (player) => {
          server.broadcast(
            {
              type: "playerJoined",
              payload: { player },
            },
            { exclude: this },
          );
        },
        afterLeave: (player) => {
          server.broadcast(
            {
              type: "playerLeft",
              payload: {
                playerEntityId: player.entityId,
                playerName: player.name,
              },
            },
            { exclude: this },
          );
        },
      },
      this.adapter,
    );
    this.unregisterJoinServer = this.adapter.eventBus.on("joinServer", async ({ playerName }) => {
      const payload = await this.controller.join(playerName);
      this.joinedPlayerName = playerName;
      this.server.logInfo?.(
        `[session ${this.sessionId}] player joined: ${playerName}`,
      );
      return payload;
    });
    this.server.registerSession(this);
    this.server.logInfo?.(`[session ${this.sessionId}] client connected`);
  }

  public handleEncodedMessage(encoded: string): void {
    this.transport.handleEncodedMessage(encoded);
  }

  public sendEvent<K extends keyof ServerEventMap>(message: {
    type: K;
    payload: ServerEventMap[K];
  }): void {
    this.controller.sendEvent(message);
  }

  public controlsPlayer(entityId: EntityId): boolean {
    return this.controller.controlsPlayer(entityId);
  }

  public async disconnect(closeTransport = false): Promise<void> {
    await this.controller.disconnect(closeTransport);
    if (this.joinedPlayerName) {
      this.server.logInfo?.(
        `[session ${this.sessionId}] player disconnected: ${this.joinedPlayerName}`,
      );
    } else {
      this.server.logInfo?.(`[session ${this.sessionId}] client disconnected`);
    }
    this.unregisterJoinServer();
    this.controller.dispose();
    this.server.unregisterSession(this);
  }
}

export class DedicatedServer implements DedicatedServerSessionHost {
  private readonly sessions = new Set<WorldSessionPeer>();
  private nextSessionId = 1;

  private constructor(
    public readonly world: AuthoritativeWorld,
    public readonly storage: WorldStorage,
    public readonly socketServer: Bun.Server<DedicatedSocketData>,
  ) {}

  public get contextLabel(): string {
    return "server";
  }

  public logInfo(message: string): void {
    serverLogger.info(message);
  }

  public static async start(options: {
    port?: number;
    worldName?: string;
    seed?: number;
    storageRoot?: string;
  } = {}): Promise<DedicatedServer> {
    const storage = new DedicatedWorldStorage(
      options.storageRoot ?? DEFAULT_DEDICATED_STORAGE_ROOT,
    );
    const world = await loadOrCreateDedicatedWorld(storage, options);

    let instance: DedicatedServer | null = null;
    const socketServer = Bun.serve<DedicatedSocketData>({
      port: options.port ?? DEFAULT_DEDICATED_SERVER_PORT,
      fetch(request, server) {
        const url = new URL(request.url);
        if (url.pathname !== "/ws") {
          return new Response("Not found.", { status: 404 });
        }

        const upgraded = server.upgrade(request, {
          data: {
            session: null,
          },
        });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed.", { status: 400 });
        }

        return;
      },
      websocket: {
        data: {} as DedicatedSocketData,
        open(ws) {
          ws.data.session = new DedicatedServerSession(
            instance!,
            ws,
            instance!.allocateSessionId(),
          );
        },
        message(ws, message) {
          if (typeof message !== "string") {
            return;
          }

          ws.data.session?.handleEncodedMessage(message);
        },
        close(ws) {
          const session = ws.data.session;
          ws.data.session = null;
          if (session) {
            void session.disconnect(false);
          }
        },
      },
    });

    instance = new DedicatedServer(world, storage, socketServer);
    return instance;
  }

  private allocateSessionId(): number {
    const sessionId = this.nextSessionId;
    this.nextSessionId += 1;
    return sessionId;
  }

  public registerSession(session: WorldSessionPeer): void {
    this.sessions.add(session);
  }

  public unregisterSession(session: WorldSessionPeer): void {
    this.sessions.delete(session);
  }

  public sendToPlayer<K extends keyof ServerEventMap>(
    playerEntityId: EntityId,
    message: {
      type: K;
      payload: ServerEventMap[K];
    },
  ): void {
    for (const session of this.sessions) {
      if (session.controlsPlayer(playerEntityId)) {
        session.sendEvent(message);
      }
    }
  }

  public broadcast<K extends keyof ServerEventMap>(
    message: {
      type: K;
      payload: ServerEventMap[K];
    },
    options: {
      exclude?: WorldSessionPeer;
    } = {},
  ): void {
    for (const session of this.sessions) {
      if (options.exclude && session === options.exclude) {
        continue;
      }

      session.sendEvent(message);
    }
  }

  public async shutdown(): Promise<void> {
    for (const session of [...this.sessions]) {
      if (session.disconnect) {
        await session.disconnect(true);
      }
    }

    await this.world.save();
    this.socketServer.stop(true);
  }
}
