import type {
  ChatEntry,
  ChunkCoord,
  DroppedItemSnapshot,
  EntityId,
  InventorySnapshot,
  PlayerGamemode,
  PlayerName,
  PlayerSnapshot,
  PlayerState,
} from "@voxel/core/shared";
import type { ChunkPayload, JoinedWorldPayload } from "@voxel/core/shared";
import {
  ACTIVE_CHUNK_RADIUS,
  STARTUP_CHUNK_RADIUS,
  VoxelWorld,
  createDefaultInventory,
  getChunkCoordsAroundPosition,
  normalizeInventorySnapshot,
} from "@voxel/core/client";
import type { IClientAdapter } from "./client-adapter.ts";

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

export class ClientWorldRuntime {
  public readonly world = new VoxelWorld();
  public inventory: InventorySnapshot = createDefaultInventory();
  public clientPlayerName: PlayerName | null = null;
  public clientPlayerEntityId: EntityId | null = null;
  public readonly players = new Map<EntityId, PlayerSnapshot>();
  public readonly droppedItems = new Map<EntityId, DroppedItemSnapshot>();
  private readonly playerEntityIdsByName = new Map<PlayerName, EntityId>();
  public chatMessages: ChatEntry[] = [];
  private readonly pendingChunkKeys = new Set<string>();
  private readonly chunkWaiters = new Set<{
    coords: ChunkCoord[];
    resolve: () => void;
  }>();

  public constructor(private readonly adapter: IClientAdapter) {}

  public reset(): void {
    this.world.clear();
    this.inventory = createDefaultInventory();
    this.clientPlayerName = null;
    this.clientPlayerEntityId = null;
    this.players.clear();
    this.droppedItems.clear();
    this.playerEntityIdsByName.clear();
    this.chatMessages = [];
    this.pendingChunkKeys.clear();
    this.chunkWaiters.clear();
  }

  public applyChunk(chunk: ChunkPayload): void {
    this.world.replaceChunk(chunk.coord, chunk.blocks, chunk.revision);
    this.pendingChunkKeys.delete(chunkKey(chunk.coord));
    this.resolveWaiters();
  }

  public applyInventory(inventory: InventorySnapshot): void {
    this.inventory = normalizeInventorySnapshot(inventory);
  }

  public applyJoinedWorld(joined: JoinedWorldPayload): void {
    this.clientPlayerName = joined.clientPlayerName;
    this.clientPlayerEntityId = joined.clientPlayer.entityId;
    this.players.clear();
    this.droppedItems.clear();
    this.playerEntityIdsByName.clear();
    this.applyPlayer(joined.clientPlayer);
    for (const player of joined.players) {
      this.applyPlayer(player);
    }
    for (const item of joined.droppedItems) {
      this.applyDroppedItem(item);
    }
    this.applyInventory(joined.inventory);
  }

  public applyPlayer(player: PlayerSnapshot): void {
    const previousEntityId = this.playerEntityIdsByName.get(player.name);
    if (previousEntityId && previousEntityId !== player.entityId) {
      this.players.delete(previousEntityId);
    }

    const snapshot = this.clonePlayerSnapshot(player);
    this.players.set(player.entityId, snapshot);
    this.playerEntityIdsByName.set(player.name, player.entityId);

    if (player.name === this.clientPlayerName) {
      this.clientPlayerEntityId = player.entityId;
    }
  }

  public removePlayer(entityId: EntityId, playerName?: PlayerName): void {
    const snapshot = this.players.get(entityId);
    this.players.delete(entityId);

    const resolvedPlayerName = playerName ?? snapshot?.name;
    if (resolvedPlayerName && this.playerEntityIdsByName.get(resolvedPlayerName) === entityId) {
      this.playerEntityIdsByName.delete(resolvedPlayerName);
    }

    if (this.clientPlayerEntityId === entityId) {
      this.clientPlayerEntityId = null;
    }
  }

  public applyDroppedItem(item: DroppedItemSnapshot): void {
    this.droppedItems.set(item.entityId, {
      entityId: item.entityId,
      position: [...item.position],
      velocity: [...item.velocity],
      itemId: item.itemId,
      count: item.count,
      pickupCooldownMs: item.pickupCooldownMs,
    });
  }

  public removeDroppedItem(entityId: EntityId): void {
    this.droppedItems.delete(entityId);
  }

  public getClientPlayer(): PlayerSnapshot | null {
    if (!this.clientPlayerEntityId) {
      return null;
    }

    return this.players.get(this.clientPlayerEntityId) ?? null;
  }

  public createLocalPlayerSnapshot(
    state: PlayerState,
    gamemode: PlayerGamemode,
    flying: boolean,
  ): PlayerSnapshot | null {
    if (!this.clientPlayerName || !this.clientPlayerEntityId) {
      return null;
    }

    return {
      entityId: this.clientPlayerEntityId,
      name: this.clientPlayerName,
      active: true,
      gamemode,
      flying,
      state: {
        position: [...state.position],
        yaw: state.yaw,
        pitch: state.pitch,
      },
    };
  }

  public appendChatMessage(entry: ChatEntry, maxMessages = 24): void {
    this.chatMessages = [...this.chatMessages, this.cloneChatEntry(entry)].slice(-maxMessages);
  }

  public getChunkCoordsAroundPosition(
    position: readonly [number, number, number],
    radius = ACTIVE_CHUNK_RADIUS,
  ): ChunkCoord[] {
    return getChunkCoordsAroundPosition(position, radius);
  }

  public getStartupChunkCoordsAroundPosition(
    position: readonly [number, number, number],
    radius = STARTUP_CHUNK_RADIUS,
  ): ChunkCoord[] {
    return getChunkCoordsAroundPosition(position, radius, {
      nearestFirst: true,
    });
  }

  public async requestMissingChunks(coords: readonly ChunkCoord[]): Promise<void> {
    const missingCoords: ChunkCoord[] = [];

    for (const coord of coords) {
      const key = chunkKey(coord);
      if (this.world.hasChunk(coord) || this.pendingChunkKeys.has(key)) {
        continue;
      }

      this.pendingChunkKeys.add(key);
      missingCoords.push(coord);
    }

    if (missingCoords.length === 0) {
      return;
    }

    try {
      await this.adapter.eventBus.send({
        type: "requestChunks",
        payload: {
          coords: missingCoords,
        },
      });
    } catch (error) {
      for (const coord of missingCoords) {
        this.pendingChunkKeys.delete(chunkKey(coord));
      }
      throw error;
    }
  }

  public async requestChunksAroundPosition(
    position: readonly [number, number, number],
    radius = ACTIVE_CHUNK_RADIUS,
  ): Promise<void> {
    await this.requestMissingChunks(this.getChunkCoordsAroundPosition(position, radius));
  }

  public waitForChunks(coords: readonly ChunkCoord[]): Promise<void> {
    if (coords.every((coord) => this.world.hasChunk(coord))) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.chunkWaiters.add({
        coords: [...coords],
        resolve,
      });
    });
  }

  private resolveWaiters(): void {
    for (const waiter of [...this.chunkWaiters]) {
      if (waiter.coords.every((coord) => this.world.hasChunk(coord))) {
        this.chunkWaiters.delete(waiter);
        waiter.resolve();
      }
    }
  }

  private clonePlayerSnapshot(player: PlayerSnapshot): PlayerSnapshot {
    return {
      entityId: player.entityId,
      name: player.name,
      active: player.active,
      gamemode: player.gamemode,
      flying: player.flying,
      state: {
        position: [...player.state.position],
        yaw: player.state.yaw,
        pitch: player.state.pitch,
      },
    };
  }

  private cloneChatEntry(entry: ChatEntry): ChatEntry {
    return {
      kind: entry.kind,
      text: entry.text,
      senderName: entry.senderName,
      receivedAt: entry.receivedAt,
    };
  }
}
