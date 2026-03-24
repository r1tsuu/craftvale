import { join } from "node:path";
import { type JoinedWorldPayload, type SaveStatusPayload } from "../shared/messages.ts";
import type { ChatEntry, EntityId, PlayerGamemode, PlayerName } from "../types.ts";
import { AuthoritativeWorld, type WorldSimulationResult } from "./authoritative-world.ts";
import { BinaryWorldStorage, type WorldStorage } from "./world-storage.ts";
import type { IServerAdapter } from "./server-adapter.ts";

const projectRoot = import.meta.dir.endsWith("/src/server")
  ? import.meta.dir.slice(0, -"/src/server".length)
  : import.meta.dir;

export const DEFAULT_WORLD_STORAGE_ROOT = join(projectRoot, "data");

export class ServerRuntime {
  private activeWorld: AuthoritativeWorld | null = null;
  private currentPlayerEntityId: EntityId | null = null;

  public constructor(
    private readonly adapter: Pick<IServerAdapter, "eventBus" | "close">,
    private readonly storage: WorldStorage = new BinaryWorldStorage(DEFAULT_WORLD_STORAGE_ROOT),
  ) {
    this.registerHandlers();
  }

  public async shutdown(): Promise<void> {
    await this.flushActiveWorld();
    this.adapter.close();
  }

  private registerHandlers(): void {
    this.adapter.eventBus.on("listWorlds", async () => ({
      worlds: await this.storage.listWorlds(),
    }));

    this.adapter.eventBus.on("createWorld", async ({ name, seed }) => ({
      world: await this.storage.createWorld(name, seed),
    }));

    this.adapter.eventBus.on("joinWorld", async ({ name, playerName }) => {
      if (this.activeWorld?.summary.name !== name) {
        await this.flushActiveWorld();
      } else {
        await this.releaseCurrentPlayer();
      }

      const world = await this.storage.getWorld(name);
      if (!world) {
        throw new Error(`World "${name}" does not exist.`);
      }

      if (!this.activeWorld || this.activeWorld.summary.name !== name) {
        this.activeWorld = new AuthoritativeWorld(world, this.storage);
      }

      const joinedPlayer = await this.activeWorld.joinPlayer(playerName);
      this.currentPlayerEntityId = joinedPlayer.clientPlayer.entityId;
      const payload: JoinedWorldPayload = {
        world: this.activeWorld.summary,
        clientPlayerName: playerName,
        clientPlayer: joinedPlayer.clientPlayer,
        players: joinedPlayer.players,
        inventory: joinedPlayer.inventory,
        droppedItems: joinedPlayer.droppedItems,
      };
      this.adapter.eventBus.send({
        type: "joinedWorld",
        payload,
      });
      return payload;
    });

    this.adapter.eventBus.on("requestChunks", async ({ coords }) => {
      if (!this.activeWorld) {
        throw new Error("Join a world before requesting chunks.");
      }

      const seen = new Set<string>();
      let accepted = 0;

      for (const coord of coords) {
        const key = `${coord.x},${coord.y},${coord.z}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        const chunk = await this.activeWorld.getChunkPayload(coord);
        this.adapter.eventBus.send({
          type: "chunkDelivered",
          payload: { chunk },
        });
        accepted += 1;
      }

      return { accepted };
    });

    this.adapter.eventBus.on("saveWorld", async () => {
      if (!this.activeWorld) {
        throw new Error("Join a world before saving.");
      }

      try {
        const result = await this.activeWorld.save();
        this.emitSaveStatus({
          worldName: result.world.name,
          savedChunks: result.savedChunks,
          success: true,
        });
        return result;
      } catch (error) {
        this.emitSaveStatus({
          worldName: this.activeWorld.summary.name,
          savedChunks: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });

    this.adapter.eventBus.on("deleteWorld", async ({ name }) => {
      if (this.activeWorld?.summary.name === name) {
        await this.flushActiveWorld();
        this.activeWorld = null;
      }

      const deleted = await this.storage.deleteWorld(name);
      if (deleted) {
        this.adapter.eventBus.send({
          type: "worldDeleted",
          payload: { name },
        });
      }
      return { deleted, name };
    });

    this.adapter.eventBus.on("mutateBlock", async ({ x, y, z, blockId }) => {
      if (!this.activeWorld || !this.currentPlayerEntityId) {
        throw new Error("Join a world before mutating blocks.");
      }

      const playerEntityId = this.currentPlayerEntityId;
      const playerName = this.requireCurrentPlayerName();
      const result = await this.activeWorld.applyBlockMutation(playerEntityId, x, y, z, blockId);
      for (const chunk of result.changedChunks) {
        this.adapter.eventBus.send({
          type: "chunkChanged",
          payload: { chunk },
        });
      }

      if (result.inventoryChanged) {
        this.adapter.eventBus.send({
          type: "inventoryUpdated",
          payload: {
            playerEntityId,
            playerName,
            inventory: result.inventory,
          },
        });
      }

      this.emitWorldSimulation(result.droppedItems);
    });

    this.adapter.eventBus.on("selectInventorySlot", async ({ slot }) => {
      if (!this.activeWorld || !this.currentPlayerEntityId) {
        throw new Error("Join a world before selecting inventory.");
      }

      const playerEntityId = this.currentPlayerEntityId;
      const inventory = await this.activeWorld.selectInventorySlot(playerEntityId, slot);
      this.adapter.eventBus.send({
        type: "inventoryUpdated",
        payload: {
          playerEntityId,
          playerName: this.requireCurrentPlayerName(),
          inventory,
        },
      });
    });

    this.adapter.eventBus.on("interactInventorySlot", async ({ section, slot }) => {
      if (!this.activeWorld || !this.currentPlayerEntityId) {
        throw new Error("Join a world before interacting with inventory.");
      }

      const playerEntityId = this.currentPlayerEntityId;
      const inventory = await this.activeWorld.interactInventorySlot(
        playerEntityId,
        section,
        slot,
      );
      this.adapter.eventBus.send({
        type: "inventoryUpdated",
        payload: {
          playerEntityId,
          playerName: this.requireCurrentPlayerName(),
          inventory,
        },
      });
    });

    this.adapter.eventBus.on("updatePlayerState", async ({ state, flying }) => {
      if (!this.activeWorld || !this.currentPlayerEntityId) {
        throw new Error("Join a world before updating player state.");
      }

      const result = await this.activeWorld.updatePlayerState(
        this.currentPlayerEntityId,
        state,
        flying,
      );
      this.adapter.eventBus.send({
        type: "playerUpdated",
        payload: { player: result.player },
      });
      this.emitWorldSimulation(result.simulation);
    });

    this.adapter.eventBus.on("submitChat", async ({ text }) => {
      if (!this.activeWorld || !this.currentPlayerEntityId) {
        throw new Error("Join a world before chatting.");
      }

      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      if (trimmed.startsWith("/")) {
        await this.handleCommand(trimmed.slice(1));
        return;
      }

      this.emitChatMessage({
        kind: "player",
        senderName: this.requireCurrentPlayerName(),
        text: trimmed,
        receivedAt: Date.now(),
      });
    });
  }

  private emitSaveStatus(payload: SaveStatusPayload): void {
    this.adapter.eventBus.send({
      type: "saveStatus",
      payload,
    });
  }

  private emitChatMessage(entry: ChatEntry): void {
    this.adapter.eventBus.send({
      type: "chatMessage",
      payload: { entry },
    });
  }

  private emitWorldSimulation(result: WorldSimulationResult): void {
    for (const inventoryUpdate of result.inventoryUpdates) {
      this.adapter.eventBus.send({
        type: "inventoryUpdated",
        payload: inventoryUpdate,
      });
    }

    for (const item of result.spawnedDroppedItems) {
      this.adapter.eventBus.send({
        type: "droppedItemSpawned",
        payload: { item },
      });
    }

    for (const item of result.updatedDroppedItems) {
      this.adapter.eventBus.send({
        type: "droppedItemUpdated",
        payload: { item },
      });
    }

    for (const entityId of result.removedDroppedItemEntityIds) {
      this.adapter.eventBus.send({
        type: "droppedItemRemoved",
        payload: { entityId },
      });
    }
  }

  private async handleCommand(commandLine: string): Promise<void> {
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
        await this.handleGamemodeCommand(args);
        return;
      default:
        this.emitSystemMessage(`Unknown command: ${commandName}`);
    }
  }

  private async handleGamemodeCommand(args: string[]): Promise<void> {
    if (!this.activeWorld) {
      return;
    }

    const [modeToken] = args;
    if (modeToken !== "0" && modeToken !== "1") {
      this.emitSystemMessage("Usage: /gamemode <0|1>");
      return;
    }

    const gamemode = Number(modeToken) as PlayerGamemode;
    const playerEntityId = this.requireCurrentPlayerEntityId();
    const player = await this.activeWorld.setPlayerGamemode(playerEntityId, gamemode);
    this.adapter.eventBus.send({
      type: "playerUpdated",
      payload: { player },
    });
    this.emitSystemMessage(
      gamemode === 1
        ? "Gamemode set to creative."
        : "Gamemode set to normal.",
    );
  }

  private emitSystemMessage(text: string): void {
    this.emitChatMessage({
      kind: "system",
      text,
      receivedAt: Date.now(),
    });
  }

  private async flushActiveWorld(): Promise<void> {
    if (!this.activeWorld) {
      return;
    }

    await this.releaseCurrentPlayer();
    await this.activeWorld.save();
    this.activeWorld = null;
  }

  private async releaseCurrentPlayer(): Promise<void> {
    if (!this.activeWorld || !this.currentPlayerEntityId) {
      return;
    }

    const playerEntityId = this.currentPlayerEntityId;
    const leftPlayer = await this.activeWorld.leavePlayer(playerEntityId);
    this.currentPlayerEntityId = null;
    if (!leftPlayer) {
      return;
    }

    this.adapter.eventBus.send({
      type: "playerLeft",
      payload: {
        playerEntityId,
        playerName: leftPlayer.name,
      },
    });
  }

  private requireCurrentPlayerEntityId(): EntityId {
    if (!this.currentPlayerEntityId) {
      throw new Error("Join a world before acting as a player.");
    }

    return this.currentPlayerEntityId;
  }

  private requireCurrentPlayerName(): PlayerName {
    if (!this.activeWorld) {
      throw new Error("Join a world before acting as a player.");
    }

    const playerName = this.activeWorld.getPlayerName(this.requireCurrentPlayerEntityId());
    if (!playerName) {
      throw new Error("Current player session is missing its authoritative entity.");
    }

    return playerName;
  }
}
