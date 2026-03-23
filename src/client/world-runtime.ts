import type {
  ChatEntry,
  ChunkCoord,
  InventorySnapshot,
  PlayerGamemode,
  PlayerName,
  PlayerSnapshot,
  PlayerState,
} from "../types.ts";
import { ACTIVE_CHUNK_RADIUS, CHUNK_SIZE, WORLD_LAYER_CHUNKS_Y } from "../world/constants.ts";
import { createDefaultInventory, normalizeInventorySnapshot } from "../world/inventory.ts";
import { VoxelWorld } from "../world/world.ts";
import type { ChunkPayload, JoinedWorldPayload } from "../shared/messages.ts";
import type { IClientAdapter } from "./client-adapter.ts";

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

export class ClientWorldRuntime {
  public readonly world = new VoxelWorld();
  public inventory: InventorySnapshot = createDefaultInventory();
  public clientPlayerName: PlayerName | null = null;
  public readonly players = new Map<PlayerName, PlayerSnapshot>();
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
    this.players.clear();
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
    this.players.clear();
    this.applyPlayer(joined.clientPlayer);
    for (const player of joined.players) {
      this.applyPlayer(player);
    }
    this.applyInventory(joined.inventory);
  }

  public applyPlayer(player: PlayerSnapshot): void {
    this.players.set(player.name, this.clonePlayerSnapshot(player));
  }

  public removePlayer(playerName: PlayerName): void {
    this.players.delete(playerName);
  }

  public getClientPlayer(): PlayerSnapshot | null {
    if (!this.clientPlayerName) {
      return null;
    }

    return this.players.get(this.clientPlayerName) ?? null;
  }

  public createLocalPlayerSnapshot(
    state: PlayerState,
    gamemode: PlayerGamemode,
    flying: boolean,
  ): PlayerSnapshot | null {
    if (!this.clientPlayerName) {
      return null;
    }

    return {
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

  public appendChatMessage(entry: ChatEntry, maxMessages = 8): void {
    this.chatMessages = [...this.chatMessages, this.cloneChatEntry(entry)].slice(-maxMessages);
  }

  public getChunkCoordsAroundPosition(
    position: readonly [number, number, number],
    radius = ACTIVE_CHUNK_RADIUS,
  ): ChunkCoord[] {
    const centerChunkX = Math.floor(position[0] / CHUNK_SIZE);
    const centerChunkZ = Math.floor(position[2] / CHUNK_SIZE);
    const coords: ChunkCoord[] = [];

    for (let chunkZ = centerChunkZ - radius; chunkZ <= centerChunkZ + radius; chunkZ += 1) {
      for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1) {
        for (const chunkY of WORLD_LAYER_CHUNKS_Y) {
          coords.push({ x: chunkX, y: chunkY, z: chunkZ });
        }
      }
    }

    return coords;
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
