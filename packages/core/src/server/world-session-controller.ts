import {
  resolveTimesetPreset,
  setWorldTimeOfDay,
} from "../shared/lighting.ts";
import {
  type JoinedWorldPayload,
  type LoadingProgressPayload,
  type SaveStatusPayload,
  type ServerEventMap,
} from "../shared/messages.ts";
import type {
  ChatEntry,
  EntityId,
  PlayerGamemode,
  PlayerName,
  PlayerSnapshot,
} from "../types.ts";
import type { IServerAdapter } from "./server-adapter.ts";
import { AuthoritativeWorld } from "./authoritative-world.ts";
import type { QueuedGameplayIntent } from "./world-tick.ts";

type QueuedGameplayIntentInput =
  | Omit<Extract<QueuedGameplayIntent, { kind: "mutateBlock" }>, "sequence">
  | Omit<Extract<QueuedGameplayIntent, { kind: "selectInventorySlot" }>, "sequence">
  | Omit<Extract<QueuedGameplayIntent, { kind: "interactInventorySlot" }>, "sequence">
  | Omit<Extract<QueuedGameplayIntent, { kind: "updatePlayerState" }>, "sequence">;

export interface WorldSessionPeer {
  sendEvent<K extends keyof ServerEventMap>(message: {
    type: K;
    payload: ServerEventMap[K];
  }): void;
  controlsPlayer(entityId: EntityId): boolean;
  disconnect?(closeTransport?: boolean): Promise<void>;
}

export interface WorldSessionHost {
  readonly contextLabel: string;
  getWorld(): AuthoritativeWorld | null;
  allocateIntentSequence(): number;
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
  afterJoin?(player: PlayerSnapshot): void;
  afterLeave?(player: PlayerSnapshot): void;
}

export class WorldSessionController implements WorldSessionPeer {
  private currentPlayerEntityId: EntityId | null = null;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly pendingIntents: QueuedGameplayIntent[] = [];

  public constructor(
    private readonly host: WorldSessionHost,
    private readonly adapter: Pick<IServerAdapter, "eventBus" | "close">,
  ) {
    this.registerHandlers();
  }

  public async join(
    playerName: PlayerName,
    options: {
      emitLoadingProgress?: boolean;
    } = {},
  ): Promise<JoinedWorldPayload> {
    const world = this.requireWorld("joining");
    await this.releaseCurrentPlayer(world);
    const initialStartupChunkTotal = world.getStartupChunkCoords().length;

    if (options.emitLoadingProgress) {
      this.emitLoadingProgress({
        worldName: world.summary.name,
        stage: "preparing-world",
        statusText: "PREPARING WORLD...",
        completedUnits: 1,
        totalUnits: initialStartupChunkTotal + 3,
        completedChunks: 0,
        totalChunks: initialStartupChunkTotal,
      });
    }

    const joinedPlayer = await world.joinPlayer(playerName);
    this.currentPlayerEntityId = joinedPlayer.clientPlayer.entityId;
    const startupChunkCoords = world.getStartupChunkCoords(
      joinedPlayer.clientPlayer.state.position,
    );
    const totalUnits = startupChunkCoords.length + 3;

    await world.pregenerateStartupArea(
      joinedPlayer.clientPlayer.state.position,
      undefined,
      ({ completedChunks, totalChunks }) => {
        if (!options.emitLoadingProgress) {
          return;
        }

        this.emitLoadingProgress({
          worldName: world.summary.name,
          stage: "generating-startup-area",
          statusText: "GENERATING STARTUP AREA...",
          completedUnits: 1 + completedChunks,
          totalUnits,
          completedChunks,
          totalChunks,
        });
      },
    );

    if (options.emitLoadingProgress) {
      this.emitLoadingProgress({
        worldName: world.summary.name,
        stage: "synchronizing-initial-state",
        statusText: "SYNCHRONIZING INITIAL STATE...",
        completedUnits: totalUnits - 1,
        totalUnits,
        completedChunks: startupChunkCoords.length,
        totalChunks: startupChunkCoords.length,
      });
    }

    const payload: JoinedWorldPayload = {
      world: world.summary,
      worldTime: world.getWorldTimeState(),
      clientPlayerName: playerName,
      clientPlayer: joinedPlayer.clientPlayer,
      players: joinedPlayer.players,
      inventory: joinedPlayer.inventory,
      droppedItems: joinedPlayer.droppedItems,
    };

    this.sendEvent({
      type: "joinedWorld",
      payload,
    });
    if (options.emitLoadingProgress) {
      this.emitLoadingProgress({
        worldName: world.summary.name,
        stage: "ready",
        statusText: "READY",
        completedUnits: totalUnits,
        totalUnits,
        completedChunks: startupChunkCoords.length,
        totalChunks: startupChunkCoords.length,
      });
    }
    this.host.afterJoin?.(joinedPlayer.clientPlayer);
    return payload;
  }

  public async disconnect(closeTransport = false): Promise<void> {
    const leftPlayer = await this.releaseCurrentPlayer();
    if (leftPlayer) {
      this.host.afterLeave?.(leftPlayer);
    }

    if (closeTransport) {
      this.adapter.close();
    }
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
  }

  public sendEvent<K extends keyof ServerEventMap>(message: {
    type: K;
    payload: ServerEventMap[K];
  }): void {
    this.adapter.eventBus.send(message);
  }

  public controlsPlayer(entityId: EntityId): boolean {
    return this.currentPlayerEntityId === entityId;
  }

  public drainQueuedIntents(): QueuedGameplayIntent[] {
    return this.pendingIntents.splice(0);
  }

  private registerHandlers(): void {
    this.unsubscribers.push(
      this.adapter.eventBus.on("requestChunks", async ({ coords }) => {
        const world = this.requireWorld("requesting chunks");
        this.requireCurrentPlayerEntityId();

        const seen = new Set<string>();
        let accepted = 0;

        for (const coord of coords) {
          const key = `${coord.x},${coord.y},${coord.z}`;
          if (seen.has(key)) {
            continue;
          }

          seen.add(key);
          const chunk = await world.getChunkPayload(coord);
          this.sendEvent({
            type: "chunkDelivered",
            payload: { chunk },
          });
          accepted += 1;
        }

        return { accepted };
      }),
      this.adapter.eventBus.on("saveWorld", async () => {
        const world = this.requireWorld("saving");

        try {
          const result = await world.save();
          this.emitSaveStatus({
            worldName: result.world.name,
            savedChunks: result.savedChunks,
            success: true,
          });
          return result;
        } catch (error) {
          this.emitSaveStatus({
            worldName: world.summary.name,
            savedChunks: 0,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }),
      this.adapter.eventBus.on("mutateBlock", ({ x, y, z, blockId }) => {
        this.requireWorld("mutating blocks");
        this.enqueueIntent({
          kind: "mutateBlock",
          playerEntityId: this.requireCurrentPlayerEntityId(),
          x,
          y,
          z,
          blockId,
        });
      }),
      this.adapter.eventBus.on("selectInventorySlot", ({ slot }) => {
        this.requireWorld("selecting inventory");
        this.enqueueIntent({
          kind: "selectInventorySlot",
          playerEntityId: this.requireCurrentPlayerEntityId(),
          slot,
        });
      }),
      this.adapter.eventBus.on("interactInventorySlot", ({ section, slot }) => {
        this.requireWorld("interacting with inventory");
        this.enqueueIntent({
          kind: "interactInventorySlot",
          playerEntityId: this.requireCurrentPlayerEntityId(),
          section,
          slot,
        });
      }),
      this.adapter.eventBus.on("updatePlayerState", ({ state, flying }) => {
        this.requireWorld("updating player state");
        this.enqueueIntent({
          kind: "updatePlayerState",
          playerEntityId: this.requireCurrentPlayerEntityId(),
          state,
          flying,
        });
      }),
      this.adapter.eventBus.on("submitChat", async ({ text }) => {
        const world = this.requireWorld("chatting");
        const playerEntityId = this.requireCurrentPlayerEntityId();
        const trimmed = text.trim();
        if (!trimmed) {
          return;
        }

        if (trimmed.startsWith("/")) {
          await this.handleCommand(world, playerEntityId, trimmed.slice(1));
          return;
        }

        this.host.broadcast({
          type: "chatMessage",
          payload: {
            entry: {
              kind: "player",
              senderName: this.requireCurrentPlayerName(world),
              text: trimmed,
              receivedAt: Date.now(),
            },
          },
        });
      }),
    );
  }

  private emitSaveStatus(payload: SaveStatusPayload): void {
    this.sendEvent({
      type: "saveStatus",
      payload,
    });
  }

  private emitLoadingProgress(payload: LoadingProgressPayload): void {
    this.sendEvent({
      type: "loadingProgress",
      payload,
    });
  }

  private emitSystemMessage(text: string): void {
    const entry: ChatEntry = {
      kind: "system",
      text,
      receivedAt: Date.now(),
    };
    this.sendEvent({
      type: "chatMessage",
      payload: { entry },
    });
  }

  private async handleCommand(
    world: AuthoritativeWorld,
    playerEntityId: EntityId,
    commandLine: string,
  ): Promise<void> {
    const parts = commandLine
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      this.emitSystemMessage("Command is empty.");
      return;
    }

    const [commandName, ...args] = parts;
    switch (commandName.toLowerCase()) {
      case "gamemode":
        await this.handleGamemodeCommand(world, playerEntityId, args);
        return;
      case "timeset":
        await this.handleTimesetCommand(world, args);
        return;
      default:
        this.emitSystemMessage(`Unknown command: ${commandName}`);
    }
  }

  private async handleGamemodeCommand(
    world: AuthoritativeWorld,
    playerEntityId: EntityId,
    args: string[],
  ): Promise<void> {
    const [modeToken] = args;
    if (modeToken !== "0" && modeToken !== "1") {
      this.emitSystemMessage("Usage: /gamemode <0|1>");
      return;
    }

    const gamemode = Number(modeToken) as PlayerGamemode;
    const player = await world.setPlayerGamemode(playerEntityId, gamemode);
    this.host.broadcast({
      type: "playerUpdated",
      payload: { player },
    });
    this.emitSystemMessage(
      gamemode === 1
        ? "Gamemode set to creative."
        : "Gamemode set to normal.",
    );
  }

  private async handleTimesetCommand(
    world: AuthoritativeWorld,
    args: string[],
  ): Promise<void> {
    const [value] = args;
    if (!value) {
      this.emitSystemMessage("Usage: /timeset <ticks|sunrise|day|noon|sunset|night|midnight>");
      return;
    }

    const presetTicks = resolveTimesetPreset(value);
    const parsedTicks = presetTicks ?? Number(value);
    if (!Number.isFinite(parsedTicks)) {
      this.emitSystemMessage("Usage: /timeset <ticks|sunrise|day|noon|sunset|night|midnight>");
      return;
    }

    const worldTime = await world.setWorldTime(setWorldTimeOfDay(parsedTicks));
    this.host.broadcast({
      type: "worldTimeUpdated",
      payload: { worldTime },
    });
    this.emitSystemMessage(
      `Time set to Day ${worldTime.dayCount + 1} ${worldTime.timeOfDayTicks}.`,
    );
  }

  private enqueueIntent(intent: QueuedGameplayIntentInput): void {
    this.pendingIntents.push({
      ...intent,
      sequence: this.host.allocateIntentSequence(),
    });
  }

  private async releaseCurrentPlayer(world = this.host.getWorld()): Promise<PlayerSnapshot | null> {
    if (!world || !this.currentPlayerEntityId) {
      return null;
    }

    const leftPlayer = await world.leavePlayer(this.currentPlayerEntityId);
    this.currentPlayerEntityId = null;
    return leftPlayer;
  }

  private requireWorld(action: string): AuthoritativeWorld {
    const world = this.host.getWorld();
    if (!world) {
      throw new Error(`Join the ${this.host.contextLabel} before ${action}.`);
    }

    return world;
  }

  private requireCurrentPlayerEntityId(): EntityId {
    if (!this.currentPlayerEntityId) {
      throw new Error(`Join the ${this.host.contextLabel} before acting as a player.`);
    }

    return this.currentPlayerEntityId;
  }

  private requireCurrentPlayerName(world: AuthoritativeWorld): PlayerName {
    const playerName = world.getPlayerName(this.requireCurrentPlayerEntityId());
    if (!playerName) {
      throw new Error("Current player session is missing its authoritative entity.");
    }

    return playerName;
  }
}
