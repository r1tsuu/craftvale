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
import { type IServerAdapter } from "./server-adapter.ts";
import { AuthoritativeWorld, type WorldSimulationResult } from "./authoritative-world.ts";

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
      this.adapter.eventBus.on("mutateBlock", async ({ x, y, z, blockId }) => {
        const world = this.requireWorld("mutating blocks");
        const playerEntityId = this.requireCurrentPlayerEntityId();
        const playerName = this.requireCurrentPlayerName(world);
        const result = await world.applyBlockMutation(playerEntityId, x, y, z, blockId);

        for (const chunk of result.changedChunks) {
          this.host.broadcast({
            type: "chunkChanged",
            payload: { chunk },
          });
        }

        if (result.inventoryChanged) {
          this.host.sendToPlayer(playerEntityId, {
            type: "inventoryUpdated",
            payload: {
              playerEntityId,
              playerName,
              inventory: result.inventory,
            },
          });
        }

        this.emitWorldSimulation(result.droppedItems);
      }),
      this.adapter.eventBus.on("selectInventorySlot", async ({ slot }) => {
        const world = this.requireWorld("selecting inventory");
        const playerEntityId = this.requireCurrentPlayerEntityId();
        const inventory = await world.selectInventorySlot(playerEntityId, slot);
        this.host.sendToPlayer(playerEntityId, {
          type: "inventoryUpdated",
          payload: {
            playerEntityId,
            playerName: this.requireCurrentPlayerName(world),
            inventory,
          },
        });
      }),
      this.adapter.eventBus.on("interactInventorySlot", async ({ section, slot }) => {
        const world = this.requireWorld("interacting with inventory");
        const playerEntityId = this.requireCurrentPlayerEntityId();
        const inventory = await world.interactInventorySlot(playerEntityId, section, slot);
        this.host.sendToPlayer(playerEntityId, {
          type: "inventoryUpdated",
          payload: {
            playerEntityId,
            playerName: this.requireCurrentPlayerName(world),
            inventory,
          },
        });
      }),
      this.adapter.eventBus.on("updatePlayerState", async ({ state, flying }) => {
        const world = this.requireWorld("updating player state");
        const playerEntityId = this.requireCurrentPlayerEntityId();
        const result = await world.updatePlayerState(playerEntityId, state, flying);
        this.host.broadcast({
          type: "playerUpdated",
          payload: {
            player: result.player,
          },
        });
        this.emitWorldSimulation(result.simulation);
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

  private emitWorldSimulation(result: WorldSimulationResult): void {
    for (const inventoryUpdate of result.inventoryUpdates) {
      this.host.sendToPlayer(inventoryUpdate.playerEntityId, {
        type: "inventoryUpdated",
        payload: inventoryUpdate,
      });
    }

    for (const item of result.spawnedDroppedItems) {
      this.host.broadcast({
        type: "droppedItemSpawned",
        payload: { item },
      });
    }

    for (const item of result.updatedDroppedItems) {
      this.host.broadcast({
        type: "droppedItemUpdated",
        payload: { item },
      });
    }

    for (const entityId of result.removedDroppedItemEntityIds) {
      this.host.broadcast({
        type: "droppedItemRemoved",
        payload: { entityId },
      });
    }
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
