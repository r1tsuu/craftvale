import type {
  BlockId,
  ChunkCoord,
  DroppedItemSnapshot,
  EntityId,
  InventorySnapshot,
  ItemId,
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
import { getDroppedItemIdForBlock, isBreakableBlock, isCollectibleBlock } from "../world/blocks.ts";
import {
  CHUNK_SIZE,
  STARTUP_CHUNK_RADIUS,
  WORLD_LAYER_CHUNKS_Y,
} from "../world/constants.ts";
import { getPlacedBlockIdForItem } from "../world/items.ts";
import { getChunkCoordsAroundPosition } from "../world/chunk-coords.ts";
import { createGeneratedChunk, getTerrainHeight } from "../world/terrain.ts";
import { worldToChunkCoord } from "../world/world.ts";
import { DroppedItemSystem, type DroppedItemSimulationResult } from "./dropped-item-system.ts";
import { PlayerSystem } from "./player-system.ts";
import {
  createEmptyWorldTickResult,
  type QueuedGameplayIntent,
  type WorldInventoryUpdate,
  type WorldTickResult,
} from "./world-tick.ts";
import { WorldEntityState } from "./world-entity-state.ts";
import type { WorldStorage } from "./world-storage.ts";

interface ServerChunkEntry {
  chunk: Chunk;
  hasPersistedRecord: boolean;
  persistBaseline: boolean;
  saveDirty: boolean;
}

interface BlockMutationResult {
  changedChunks: ChunkPayload[];
  inventory: InventorySnapshot;
  inventoryChanged: boolean;
  droppedItems: WorldSimulationResult;
}

export interface WorldSimulationResult {
  spawnedDroppedItems: DroppedItemSnapshot[];
  updatedDroppedItems: DroppedItemSnapshot[];
  removedDroppedItemEntityIds: EntityId[];
  inventoryUpdates: WorldInventoryUpdate[];
}

export interface StartupAreaProgress {
  completedChunks: number;
  totalChunks: number;
}

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

export class AuthoritativeWorld {
  private readonly chunks = new Map<string, ServerChunkEntry>();
  private readonly entityState = new WorldEntityState();
  private readonly playerSystem: PlayerSystem;
  private readonly droppedItemSystem: DroppedItemSystem;

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

  public getStartupChunkCoords(
    position = this.spawnPosition,
    radius = STARTUP_CHUNK_RADIUS,
  ): ChunkCoord[] {
    return getChunkCoordsAroundPosition(position, radius, {
      nearestFirst: true,
    });
  }

  public async pregenerateStartupArea(
    position = this.spawnPosition,
    radius = STARTUP_CHUNK_RADIUS,
    onProgress?: (progress: StartupAreaProgress) => void,
  ): Promise<{
    coords: ChunkCoord[];
    savedChunks: number;
  }> {
    const coords = this.getStartupChunkCoords(position, radius);
    let completedChunks = 0;

    onProgress?.({
      completedChunks,
      totalChunks: coords.length,
    });

    for (const coord of coords) {
      const entry = await this.ensureChunkLoaded(coord);
      if (!entry.hasPersistedRecord) {
        entry.persistBaseline = true;
        entry.saveDirty = true;
      }

      completedChunks += 1;
      onProgress?.({
        completedChunks,
        totalChunks: coords.length,
      });
    }

    return {
      coords,
      savedChunks: await this.flushDirtyChunks(true),
    };
  }

  public async leavePlayer(entityId: EntityId): Promise<PlayerSnapshot | null> {
    return this.playerSystem.leavePlayer(entityId);
  }

  public async updatePlayerState(
    entityId: EntityId,
    state: PlayerState,
    flying: boolean,
  ): Promise<PlayerSnapshot> {
    return this.playerSystem.updatePlayerState(entityId, state, flying);
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

      if (!isBreakableBlock(current) && this.playerSystem.getPlayerSnapshot(entityId).gamemode !== 1) {
        return {
          changedChunks: [],
          inventory: nextInventory,
          inventoryChanged: false,
          droppedItems: this.createEmptyWorldSimulation(),
        };
      }

      const droppedItemId = getDroppedItemIdForBlock(current);
      if (isCollectibleBlock(current) && droppedItemId !== null) {
        const droppedItems = await this.droppedItemSystem.spawnBlockDrop(droppedItemId, 1, [
          worldX + 0.5,
          worldY + 0.75,
          worldZ + 0.5,
        ]);
        entry.chunk.set(coords.local.x, coords.local.y, coords.local.z, blockId);
        entry.chunk.revision += 1;
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
      if (current !== 0) {
        return {
          changedChunks: [],
          inventory: nextInventory,
          inventoryChanged: false,
          droppedItems: this.createEmptyWorldSimulation(),
        };
      }

      const selectedSlot = this.playerSystem.getSelectedInventorySlot(entityId);
      const placedBlockId = getPlacedBlockIdForItem(selectedSlot.itemId);
      if (selectedSlot.count <= 0 || placedBlockId === null || placedBlockId !== blockId) {
        return {
          changedChunks: [],
          inventory: nextInventory,
          inventoryChanged: false,
          droppedItems: this.createEmptyWorldSimulation(),
        };
      }

      const removed = this.playerSystem.removeSelectedInventoryItem(entityId, selectedSlot.itemId, 1);
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
    const savedChunks = await this.flushDirtyChunks(false);
    await this.playerSystem.save();
    await this.droppedItemSystem.save();
    this.world = await this.storage.touchWorld(this.world.name, Date.now());
    return {
      world: this.world,
      savedChunks,
    };
  }

  public async runTick(
    intents: readonly QueuedGameplayIntent[],
    deltaSeconds: number,
  ): Promise<WorldTickResult> {
    const result = createEmptyWorldTickResult();

    for (const intent of intents) {
      switch (intent.kind) {
        case "mutateBlock": {
          const mutation = await this.applyBlockMutation(
            intent.playerEntityId,
            intent.x,
            intent.y,
            intent.z,
            intent.blockId,
          );
          this.mergeBlockMutation(result, intent.playerEntityId, mutation);
          break;
        }
        case "selectInventorySlot": {
          this.mergeInventoryUpdate(
            result,
            intent.playerEntityId,
            await this.selectInventorySlot(intent.playerEntityId, intent.slot),
          );
          break;
        }
        case "interactInventorySlot": {
          this.mergeInventoryUpdate(
            result,
            intent.playerEntityId,
            await this.interactInventorySlot(intent.playerEntityId, intent.section, intent.slot),
          );
          break;
        }
        case "updatePlayerState": {
          this.mergePlayerUpdate(
            result,
            await this.updatePlayerState(intent.playerEntityId, intent.state, intent.flying),
          );
          break;
        }
      }
    }

    this.mergeSimulationResult(result, await this.stepSimulation(deltaSeconds));
    return result;
  }

  private async stepSimulation(deltaSeconds: number): Promise<WorldSimulationResult> {
    const result = await this.droppedItemSystem.update(
      Math.max(0, Math.min(deltaSeconds, 0.25)),
      this.playerSystem.getActivePlayers(),
      (playerEntityId, itemId, count) => this.playerSystem.addInventoryItem(playerEntityId, itemId, count),
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
    let persistBaseline = false;

    if (persisted) {
      chunk.replace(persisted.blocks, persisted.revision);
      chunk.dirty = false;
      const baseline = createGeneratedChunk(coord, this.world.seed);
      persistBaseline = chunk.blocks.every(
        (blockId, index) => blockId === baseline.blocks[index],
      );
    }

    const entry: ServerChunkEntry = {
      chunk,
      hasPersistedRecord: Boolean(persisted),
      persistBaseline,
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

  private mergeBlockMutation(
    result: WorldTickResult,
    playerEntityId: EntityId,
    mutation: BlockMutationResult,
  ): void {
    for (const chunk of mutation.changedChunks) {
      this.upsertChunk(result.changedChunks, chunk);
    }

    if (mutation.inventoryChanged) {
      this.mergeInventoryUpdate(result, playerEntityId, mutation.inventory);
    }

    this.mergeSimulationResult(result, mutation.droppedItems);
  }

  private mergeInventoryUpdate(
    result: WorldTickResult,
    playerEntityId: EntityId,
    inventory: InventorySnapshot,
  ): void {
    const playerName = this.getPlayerName(playerEntityId) ?? "Unknown";
    const next: WorldInventoryUpdate = {
      playerEntityId,
      playerName,
      inventory,
    };
    const index = result.inventoryUpdates.findIndex(
      (entry) => entry.playerEntityId === playerEntityId,
    );
    if (index >= 0) {
      result.inventoryUpdates[index] = next;
      return;
    }

    result.inventoryUpdates.push(next);
  }

  private mergePlayerUpdate(result: WorldTickResult, player: PlayerSnapshot): void {
    const index = result.playerUpdates.findIndex(
      (entry) => entry.entityId === player.entityId,
    );
    if (index >= 0) {
      result.playerUpdates[index] = player;
      return;
    }

    result.playerUpdates.push(player);
  }

  private mergeSimulationResult(
    result: WorldTickResult,
    simulation: WorldSimulationResult,
  ): void {
    for (const update of simulation.inventoryUpdates) {
      this.mergeInventoryUpdate(result, update.playerEntityId, update.inventory);
    }

    for (const item of simulation.spawnedDroppedItems) {
      this.upsertDroppedItem(result.spawnedDroppedItems, item);
      this.removeDroppedItem(result.updatedDroppedItems, item.entityId);
      this.removeRemovedDroppedItem(result.removedDroppedItemEntityIds, item.entityId);
    }

    for (const item of simulation.updatedDroppedItems) {
      if (this.upsertDroppedItem(result.spawnedDroppedItems, item)) {
        continue;
      }

      this.upsertDroppedItem(result.updatedDroppedItems, item);
      this.removeRemovedDroppedItem(result.removedDroppedItemEntityIds, item.entityId);
    }

    for (const entityId of simulation.removedDroppedItemEntityIds) {
      this.removeDroppedItem(result.spawnedDroppedItems, entityId);
      this.removeDroppedItem(result.updatedDroppedItems, entityId);
      if (!result.removedDroppedItemEntityIds.includes(entityId)) {
        result.removedDroppedItemEntityIds.push(entityId);
      }
    }
  }

  private upsertChunk(chunks: ChunkPayload[], chunk: ChunkPayload): void {
    const index = chunks.findIndex((entry) => chunkKey(entry.coord) === chunkKey(chunk.coord));
    if (index >= 0) {
      chunks[index] = chunk;
      return;
    }

    chunks.push(chunk);
  }

  private upsertDroppedItem(
    collection: DroppedItemSnapshot[],
    item: DroppedItemSnapshot,
  ): boolean {
    const index = collection.findIndex((entry) => entry.entityId === item.entityId);
    if (index >= 0) {
      collection[index] = item;
      return true;
    }

    collection.push(item);
    return false;
  }

  private removeDroppedItem(collection: DroppedItemSnapshot[], entityId: EntityId): void {
    const index = collection.findIndex((entry) => entry.entityId === entityId);
    if (index >= 0) {
      collection.splice(index, 1);
    }
  }

  private removeRemovedDroppedItem(collection: EntityId[], entityId: EntityId): void {
    const index = collection.indexOf(entityId);
    if (index >= 0) {
      collection.splice(index, 1);
    }
  }

  private async flushDirtyChunks(touchWorld: boolean): Promise<number> {
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
        if (entry.persistBaseline) {
          await this.storage.saveChunk(this.world.name, {
            coord: entry.chunk.coord,
            blocks: entry.chunk.cloneBlocks(),
            revision: entry.chunk.revision,
          });
          entry.hasPersistedRecord = true;
          savedChunks += 1;
        } else if (entry.hasPersistedRecord) {
          await this.storage.deleteChunk(this.world.name, entry.chunk.coord);
          entry.hasPersistedRecord = false;
          savedChunks += 1;
        }
      } else {
        await this.storage.saveChunk(this.world.name, {
          coord: entry.chunk.coord,
          blocks: entry.chunk.cloneBlocks(),
          revision: entry.chunk.revision,
        });
        entry.hasPersistedRecord = true;
        savedChunks += 1;
      }

      entry.saveDirty = false;
      this.chunks.set(key, entry);
    }

    if (touchWorld && savedChunks > 0) {
      this.world = await this.storage.touchWorld(this.world.name, Date.now());
    }

    return savedChunks;
  }
}
