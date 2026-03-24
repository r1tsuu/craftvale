import type {
  BlockId,
  ChunkCoord,
  DroppedItemSnapshot,
  EntityId,
  InventorySnapshot,
  PlayerGamemode,
  PlayerName,
  PlayerSnapshot,
  PlayerState,
} from "../types.ts";
import {
  type ChunkPayload,
  type WorldSummary,
} from "../shared/messages.ts";
import { Chunk } from "../world/chunk.ts";
import { isCollectibleBlock, isPlaceableBlock } from "../world/blocks.ts";
import { CHUNK_SIZE, WORLD_LAYER_CHUNKS_Y } from "../world/constants.ts";
import { createGeneratedChunk, getTerrainHeight } from "../world/terrain.ts";
import { worldToChunkCoord } from "../world/world.ts";
import { DroppedItemSystem, type DroppedItemSimulationResult } from "./dropped-item-system.ts";
import { PlayerSystem } from "./player-system.ts";
import { WorldEntityState } from "./world-entity-state.ts";
import type { WorldStorage } from "./world-storage.ts";

interface ServerChunkEntry {
  chunk: Chunk;
  hasOverride: boolean;
  saveDirty: boolean;
}

interface BlockMutationResult {
  changedChunks: ChunkPayload[];
  inventory: InventorySnapshot;
  inventoryChanged: boolean;
  droppedItems: WorldSimulationResult;
}

export interface WorldInventoryUpdate {
  playerEntityId: EntityId;
  playerName: PlayerName;
  inventory: InventorySnapshot;
}

export interface WorldSimulationResult {
  spawnedDroppedItems: DroppedItemSnapshot[];
  updatedDroppedItems: DroppedItemSnapshot[];
  removedDroppedItemEntityIds: EntityId[];
  inventoryUpdates: WorldInventoryUpdate[];
}

interface UpdatedPlayerResult {
  player: PlayerSnapshot;
  simulation: WorldSimulationResult;
}

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

export class AuthoritativeWorld {
  private readonly chunks = new Map<string, ServerChunkEntry>();
  private readonly entityState = new WorldEntityState();
  private readonly playerSystem: PlayerSystem;
  private readonly droppedItemSystem: DroppedItemSystem;
  private lastSimulationAt = Date.now();

  public constructor(
    private world: WorldSummary,
    private readonly storage: WorldStorage,
  ) {
    this.playerSystem = new PlayerSystem(
      this.world.name,
      this.storage,
      this.spawnPosition,
      this.entityState,
    );
    this.droppedItemSystem = new DroppedItemSystem(
      this.world.name,
      this.storage,
      this.entityState,
      (x, y, z) => this.getBlockAt(x, y, z),
    );
  }

  public get summary(): WorldSummary {
    return this.world;
  }

  public get spawnPosition(): [number, number, number] {
    const spawnX = 8;
    const spawnZ = 8;
    return [spawnX + 0.5, getTerrainHeight(this.world.seed, spawnX, spawnZ) + 1, spawnZ + 0.5];
  }

  public getPlayerName(entityId: EntityId): PlayerName | null {
    return this.playerSystem.getPlayerName(entityId);
  }

  public async joinPlayer(playerName: PlayerName): Promise<{
    clientPlayer: PlayerSnapshot;
    players: PlayerSnapshot[];
    inventory: InventorySnapshot;
    droppedItems: DroppedItemSnapshot[];
  }> {
    const joined = await this.playerSystem.joinPlayer(playerName);
    return {
      ...joined,
      droppedItems: await this.droppedItemSystem.getDroppedItemSnapshots(),
    };
  }

  public async leavePlayer(entityId: EntityId): Promise<PlayerSnapshot | null> {
    return this.playerSystem.leavePlayer(entityId);
  }

  public async updatePlayerState(
    entityId: EntityId,
    state: PlayerState,
    flying: boolean,
    nowMs = Date.now(),
  ): Promise<UpdatedPlayerResult> {
    const player = await this.playerSystem.updatePlayerState(entityId, state, flying);
    return {
      player,
      simulation: await this.stepSimulation(nowMs),
    };
  }

  public async setPlayerGamemode(
    entityId: EntityId,
    gamemode: PlayerGamemode,
  ): Promise<PlayerSnapshot> {
    return this.playerSystem.setPlayerGamemode(entityId, gamemode);
  }

  public async getChunkPayload(coord: ChunkCoord): Promise<ChunkPayload> {
    return this.toChunkPayload((await this.ensureChunkLoaded(coord)).chunk);
  }

  public getInventorySnapshot(entityId: EntityId): InventorySnapshot {
    return this.playerSystem.getInventorySnapshot(entityId);
  }

  public async selectInventorySlot(entityId: EntityId, slot: number): Promise<InventorySnapshot> {
    return this.playerSystem.selectInventorySlot(entityId, slot);
  }

  public async interactInventorySlot(
    entityId: EntityId,
    section: "hotbar" | "main",
    slot: number,
  ): Promise<InventorySnapshot> {
    return this.playerSystem.interactInventorySlot(entityId, section, slot);
  }

  public async applyBlockMutation(
    entityId: EntityId,
    worldX: number,
    worldY: number,
    worldZ: number,
    blockId: BlockId,
  ): Promise<BlockMutationResult> {
    const coords = worldToChunkCoord(worldX, worldY, worldZ);
    if (!WORLD_LAYER_CHUNKS_Y.includes(coords.chunk.y)) {
      return {
        changedChunks: [],
        inventory: this.playerSystem.getInventorySnapshot(entityId),
        inventoryChanged: false,
        droppedItems: this.createEmptyWorldSimulation(),
      };
    }

    const entry = await this.ensureChunkLoaded(coords.chunk);
    const current = entry.chunk.get(coords.local.x, coords.local.y, coords.local.z);
    let nextInventory = this.playerSystem.getInventorySnapshot(entityId);
    let inventoryChanged = false;

    if (blockId === 0) {
      if (current === 0) {
        return {
          changedChunks: [],
          inventory: nextInventory,
          inventoryChanged: false,
          droppedItems: this.createEmptyWorldSimulation(),
        };
      }

      if (isCollectibleBlock(current)) {
        const droppedItems = await this.droppedItemSystem.spawnBlockDrop(current, 1, [
          worldX + 0.5,
          worldY + 0.75,
          worldZ + 0.5,
        ]);
        entry.chunk.set(coords.local.x, coords.local.y, coords.local.z, blockId);
        entry.chunk.revision += 1;
        entry.hasOverride = true;
        entry.saveDirty = true;

        const affected = this.getAffectedChunkPayloads(coords.chunk, coords.local.x, coords.local.y, coords.local.z);
        return {
          changedChunks: affected,
          inventory: nextInventory,
          inventoryChanged,
          droppedItems: this.toWorldSimulationResult(droppedItems),
        };
      }
    } else {
      if (current !== 0 || !isPlaceableBlock(blockId)) {
        return {
          changedChunks: [],
          inventory: nextInventory,
          inventoryChanged: false,
          droppedItems: this.createEmptyWorldSimulation(),
        };
      }

      const selectedSlot = this.playerSystem.getSelectedInventorySlot(entityId);
      if (selectedSlot.blockId !== blockId || selectedSlot.count <= 0) {
        return {
          changedChunks: [],
          inventory: nextInventory,
          inventoryChanged: false,
          droppedItems: this.createEmptyWorldSimulation(),
        };
      }

      const removed = this.playerSystem.removeSelectedInventoryItem(entityId, blockId, 1);
      if (removed.removed <= 0) {
        return {
          changedChunks: [],
          inventory: removed.inventory,
          inventoryChanged: false,
          droppedItems: this.createEmptyWorldSimulation(),
        };
      }

      nextInventory = removed.inventory;
      inventoryChanged = removed.inventoryChanged;
    }

    entry.chunk.set(coords.local.x, coords.local.y, coords.local.z, blockId);
    entry.chunk.revision += 1;
    entry.hasOverride = true;
    entry.saveDirty = true;

    return {
      changedChunks: this.getAffectedChunkPayloads(
        coords.chunk,
        coords.local.x,
        coords.local.y,
        coords.local.z,
      ),
      inventory: nextInventory,
      inventoryChanged,
      droppedItems: this.createEmptyWorldSimulation(),
    };
  }

  public async save(): Promise<{ world: WorldSummary; savedChunks: number }> {
    let savedChunks = 0;

    for (const [key, entry] of this.chunks) {
      if (!entry.saveDirty) {
        continue;
      }

      const baseline = createGeneratedChunk(entry.chunk.coord, this.world.seed);
      const blocksMatchBaseline = entry.chunk.blocks.every(
        (blockId, index) => blockId === baseline.blocks[index],
      );

      if (blocksMatchBaseline) {
        if (entry.hasOverride) {
          await this.storage.deleteChunk(this.world.name, entry.chunk.coord);
          savedChunks += 1;
        }
        entry.hasOverride = false;
      } else {
        await this.storage.saveChunk(this.world.name, {
          coord: entry.chunk.coord,
          blocks: entry.chunk.cloneBlocks(),
          revision: entry.chunk.revision,
        });
        entry.hasOverride = true;
        savedChunks += 1;
      }

      entry.saveDirty = false;
      this.chunks.set(key, entry);
    }

    await this.playerSystem.save();
    await this.droppedItemSystem.save();
    this.world = await this.storage.touchWorld(this.world.name, Date.now());
    return {
      world: this.world,
      savedChunks,
    };
  }

  private async stepSimulation(nowMs: number): Promise<WorldSimulationResult> {
    const deltaSeconds = Math.max(0, Math.min((nowMs - this.lastSimulationAt) / 1000, 0.25));
    this.lastSimulationAt = nowMs;

    const result = await this.droppedItemSystem.update(
      deltaSeconds,
      this.playerSystem.getActivePlayers(),
      (playerEntityId, blockId, count) => this.playerSystem.addInventoryItem(playerEntityId, blockId, count),
    );
    return this.toWorldSimulationResult(result);
  }

  private async ensureChunkLoaded(coord: ChunkCoord): Promise<ServerChunkEntry> {
    const key = chunkKey(coord);
    const existing = this.chunks.get(key);
    if (existing) {
      return existing;
    }

    const persisted = await this.storage.loadChunk(this.world.name, coord);
    const chunk = persisted ? new Chunk(coord) : createGeneratedChunk(coord, this.world.seed);

    if (persisted) {
      chunk.replace(persisted.blocks, persisted.revision);
      chunk.dirty = false;
    }

    const entry: ServerChunkEntry = {
      chunk,
      hasOverride: Boolean(persisted),
      saveDirty: false,
    };
    this.chunks.set(key, entry);
    return entry;
  }

  private toChunkPayload(chunk: Chunk): ChunkPayload {
    return {
      coord: chunk.coord,
      blocks: chunk.cloneBlocks(),
      revision: chunk.revision,
    };
  }

  private getAffectedChunkPayloads(
    chunk: ChunkCoord,
    localX: number,
    localY: number,
    localZ: number,
  ): ChunkPayload[] {
    const affected = new Set<string>([chunkKey(chunk)]);
    const maybeAffect = (coord: ChunkCoord): void => {
      if (WORLD_LAYER_CHUNKS_Y.includes(coord.y) && this.chunks.has(chunkKey(coord))) {
        affected.add(chunkKey(coord));
      }
    };

    if (localX === 0) maybeAffect({ x: chunk.x - 1, y: chunk.y, z: chunk.z });
    if (localX === CHUNK_SIZE - 1) maybeAffect({ x: chunk.x + 1, y: chunk.y, z: chunk.z });
    if (localY === 0) maybeAffect({ x: chunk.x, y: chunk.y - 1, z: chunk.z });
    if (localY === CHUNK_SIZE - 1) maybeAffect({ x: chunk.x, y: chunk.y + 1, z: chunk.z });
    if (localZ === 0) maybeAffect({ x: chunk.x, y: chunk.y, z: chunk.z - 1 });
    if (localZ === CHUNK_SIZE - 1) maybeAffect({ x: chunk.x, y: chunk.y, z: chunk.z + 1 });

    return [...affected].map((key) => this.toChunkPayload(this.chunks.get(key)!.chunk));
  }

  private getBlockAt(worldX: number, worldY: number, worldZ: number): BlockId {
    const coords = worldToChunkCoord(worldX, worldY, worldZ);
    if (!WORLD_LAYER_CHUNKS_Y.includes(coords.chunk.y)) {
      return 0;
    }

    const loaded = this.chunks.get(chunkKey(coords.chunk));
    if (loaded) {
      return loaded.chunk.get(coords.local.x, coords.local.y, coords.local.z);
    }

    return createGeneratedChunk(coords.chunk, this.world.seed).get(
      coords.local.x,
      coords.local.y,
      coords.local.z,
    );
  }

  private createEmptyWorldSimulation(): WorldSimulationResult {
    return {
      spawnedDroppedItems: [],
      updatedDroppedItems: [],
      removedDroppedItemEntityIds: [],
      inventoryUpdates: [],
    };
  }

  private toWorldSimulationResult(result: DroppedItemSimulationResult): WorldSimulationResult {
    return {
      spawnedDroppedItems: result.spawned,
      updatedDroppedItems: result.updated,
      removedDroppedItemEntityIds: result.removed,
      inventoryUpdates: result.inventoryUpdates.map(({ playerEntityId, inventory }) => ({
        playerEntityId,
        playerName: this.getPlayerName(playerEntityId) ?? "Unknown",
        inventory,
      })),
    };
  }
}
