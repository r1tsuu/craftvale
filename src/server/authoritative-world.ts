import type {
  BlockId,
  ChunkCoord,
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
import {
  addInventoryItem,
  createDefaultInventory,
  getSelectedInventorySlot,
  interactInventorySlot,
  normalizeInventorySnapshot,
  removeFromSelectedInventorySlot,
  setSelectedInventorySlot,
} from "../world/inventory.ts";
import { createGeneratedChunk, getTerrainHeight } from "../world/terrain.ts";
import { worldToChunkCoord } from "../world/world.ts";
import { ComponentStore, EntityRegistry } from "./entity-system.ts";
import type { WorldStorage } from "./world-storage.ts";

interface ServerChunkEntry {
  chunk: Chunk;
  hasOverride: boolean;
  saveDirty: boolean;
}

interface PlayerIdentityComponent {
  playerName: PlayerName;
}

interface TransformComponent {
  state: PlayerState;
}

interface PlayerModeComponent {
  gamemode: PlayerGamemode;
}

interface MovementStateComponent {
  flying: boolean;
}

interface InventoryComponent {
  inventory: InventorySnapshot;
}

interface SessionPresenceComponent {
  active: boolean;
}

interface PersistenceComponent {
  saveDirty: boolean;
  persisted: boolean;
}

interface BlockMutationResult {
  changedChunks: ChunkPayload[];
  inventory: InventorySnapshot;
  inventoryChanged: boolean;
}

const DEFAULT_PLAYER_YAW = -Math.PI / 2;
const DEFAULT_PLAYER_PITCH = -0.25;
const DEFAULT_PLAYER_GAMEMODE: PlayerGamemode = 0;

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

const playerStatesEqual = (left: PlayerState, right: PlayerState): boolean =>
  left.position[0] === right.position[0] &&
  left.position[1] === right.position[1] &&
  left.position[2] === right.position[2] &&
  left.yaw === right.yaw &&
  left.pitch === right.pitch;

const inventoriesEqual = (left: InventorySnapshot, right: InventorySnapshot): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export class AuthoritativeWorld {
  private readonly chunks = new Map<string, ServerChunkEntry>();
  private readonly entityRegistry = new EntityRegistry();
  private readonly playerEntitiesByName = new Map<PlayerName, EntityId>();
  private readonly playerIdentity = new ComponentStore<PlayerIdentityComponent>();
  private readonly playerTransform = new ComponentStore<TransformComponent>();
  private readonly playerMode = new ComponentStore<PlayerModeComponent>();
  private readonly playerMovement = new ComponentStore<MovementStateComponent>();
  private readonly playerInventory = new ComponentStore<InventoryComponent>();
  private readonly playerSession = new ComponentStore<SessionPresenceComponent>();
  private readonly playerPersistence = new ComponentStore<PersistenceComponent>();

  public constructor(
    private world: WorldSummary,
    private readonly storage: WorldStorage,
  ) {}

  public get summary(): WorldSummary {
    return this.world;
  }

  public get spawnPosition(): [number, number, number] {
    const spawnX = 8;
    const spawnZ = 8;
    return [spawnX + 0.5, getTerrainHeight(this.world.seed, spawnX, spawnZ) + 1, spawnZ + 0.5];
  }

  public getPlayerName(entityId: EntityId): PlayerName | null {
    return this.playerIdentity.get(entityId)?.playerName ?? null;
  }

  public async joinPlayer(playerName: PlayerName): Promise<{
    clientPlayer: PlayerSnapshot;
    players: PlayerSnapshot[];
    inventory: InventorySnapshot;
  }> {
    const entityId = await this.ensurePlayerEntityLoaded(playerName);
    const session = this.requireComponent(this.playerSession, entityId, "player session");
    this.playerSession.set(entityId, {
      ...session,
      active: true,
    });

    return {
      clientPlayer: this.getPlayerSnapshot(entityId),
      players: this.getActivePlayerSnapshots(entityId),
      inventory: this.getInventorySnapshot(entityId),
    };
  }

  public async leavePlayer(entityId: EntityId): Promise<PlayerSnapshot | null> {
    if (!this.entityRegistry.has(entityId) || !this.playerIdentity.get(entityId)) {
      return null;
    }

    const session = this.requireComponent(this.playerSession, entityId, "player session");
    if (!session.active) {
      return this.getPlayerSnapshot(entityId);
    }

    this.playerSession.set(entityId, {
      ...session,
      active: false,
    });
    return this.getPlayerSnapshot(entityId);
  }

  public async updatePlayerState(
    entityId: EntityId,
    state: PlayerState,
    flying: boolean,
  ): Promise<PlayerSnapshot> {
    const transform = this.requireComponent(this.playerTransform, entityId, "player transform");
    const mode = this.requireComponent(this.playerMode, entityId, "player mode");
    const movement = this.requireComponent(this.playerMovement, entityId, "player movement");
    const persistence = this.requireComponent(this.playerPersistence, entityId, "player persistence");
    const nextState = this.clonePlayerState(state);
    const nextFlying = mode.gamemode === 1 ? flying : false;

    if (!playerStatesEqual(transform.state, nextState) || movement.flying !== nextFlying) {
      this.playerTransform.set(entityId, {
        state: nextState,
      });
      this.playerMovement.set(entityId, {
        flying: nextFlying,
      });
      this.playerPersistence.set(entityId, {
        ...persistence,
        saveDirty: true,
      });
    }

    return this.getPlayerSnapshot(entityId);
  }

  public async setPlayerGamemode(
    entityId: EntityId,
    gamemode: PlayerGamemode,
  ): Promise<PlayerSnapshot> {
    const mode = this.requireComponent(this.playerMode, entityId, "player mode");
    const movement = this.requireComponent(this.playerMovement, entityId, "player movement");
    const persistence = this.requireComponent(this.playerPersistence, entityId, "player persistence");
    const nextFlying = gamemode === 1 ? movement.flying : false;

    if (mode.gamemode !== gamemode || movement.flying !== nextFlying) {
      this.playerMode.set(entityId, { gamemode });
      this.playerMovement.set(entityId, { flying: nextFlying });
      this.playerPersistence.set(entityId, {
        ...persistence,
        saveDirty: true,
      });
    }

    return this.getPlayerSnapshot(entityId);
  }

  public async getChunkPayload(coord: ChunkCoord): Promise<ChunkPayload> {
    return this.toChunkPayload((await this.ensureChunkLoaded(coord)).chunk);
  }

  public getInventorySnapshot(entityId: EntityId): InventorySnapshot {
    return this.cloneInventory(
      this.requireComponent(this.playerInventory, entityId, "player inventory").inventory,
    );
  }

  public async selectInventorySlot(entityId: EntityId, slot: number): Promise<InventorySnapshot> {
    const inventory = this.requireComponent(this.playerInventory, entityId, "player inventory");
    const persistence = this.requireComponent(this.playerPersistence, entityId, "player persistence");
    const next = setSelectedInventorySlot(inventory.inventory, slot);

    if (next.selectedSlot !== inventory.inventory.selectedSlot) {
      this.playerInventory.set(entityId, { inventory: next });
      this.playerPersistence.set(entityId, {
        ...persistence,
        saveDirty: true,
      });
      return this.cloneInventory(next);
    }

    return this.cloneInventory(inventory.inventory);
  }

  public async interactInventorySlot(
    entityId: EntityId,
    section: "hotbar" | "main",
    slot: number,
  ): Promise<InventorySnapshot> {
    const inventory = this.requireComponent(this.playerInventory, entityId, "player inventory");
    const persistence = this.requireComponent(this.playerPersistence, entityId, "player persistence");
    const next = interactInventorySlot(inventory.inventory, section, slot);

    if (!inventoriesEqual(next, inventory.inventory)) {
      this.playerInventory.set(entityId, { inventory: next });
      this.playerPersistence.set(entityId, {
        ...persistence,
        saveDirty: true,
      });
      return this.cloneInventory(next);
    }

    return this.cloneInventory(inventory.inventory);
  }

  public async applyBlockMutation(
    entityId: EntityId,
    worldX: number,
    worldY: number,
    worldZ: number,
    blockId: BlockId,
  ): Promise<BlockMutationResult> {
    const inventoryComponent = this.requireComponent(this.playerInventory, entityId, "player inventory");
    const persistence = this.requireComponent(this.playerPersistence, entityId, "player persistence");
    const coords = worldToChunkCoord(worldX, worldY, worldZ);
    if (!WORLD_LAYER_CHUNKS_Y.includes(coords.chunk.y)) {
      return {
        changedChunks: [],
        inventory: this.cloneInventory(inventoryComponent.inventory),
        inventoryChanged: false,
      };
    }

    const entry = await this.ensureChunkLoaded(coords.chunk);
    const current = entry.chunk.get(coords.local.x, coords.local.y, coords.local.z);
    let nextInventory = inventoryComponent.inventory;
    let inventoryChanged = false;

    if (blockId === 0) {
      if (current === 0) {
        return {
          changedChunks: [],
          inventory: this.cloneInventory(nextInventory),
          inventoryChanged: false,
        };
      }

      if (isCollectibleBlock(current)) {
        const added = addInventoryItem(nextInventory, current, 1);
        if (added.added <= 0) {
          return {
            changedChunks: [],
            inventory: this.cloneInventory(nextInventory),
            inventoryChanged: false,
          };
        }

        nextInventory = added.inventory;
        inventoryChanged = true;
      }
    } else {
      if (current !== 0 || !isPlaceableBlock(blockId)) {
        return {
          changedChunks: [],
          inventory: this.cloneInventory(nextInventory),
          inventoryChanged: false,
        };
      }

      const selectedSlot = getSelectedInventorySlot(nextInventory);
      if (selectedSlot.blockId !== blockId || selectedSlot.count <= 0) {
        return {
          changedChunks: [],
          inventory: this.cloneInventory(nextInventory),
          inventoryChanged: false,
        };
      }

      nextInventory = removeFromSelectedInventorySlot(nextInventory, 1);
      inventoryChanged = true;
    }

    entry.chunk.set(coords.local.x, coords.local.y, coords.local.z, blockId);
    entry.chunk.revision += 1;
    entry.hasOverride = true;
    entry.saveDirty = true;

    const affected = new Set<string>([chunkKey(coords.chunk)]);
    const maybeAffect = (chunk: ChunkCoord): void => {
      if (WORLD_LAYER_CHUNKS_Y.includes(chunk.y) && this.chunks.has(chunkKey(chunk))) {
        affected.add(chunkKey(chunk));
      }
    };

    if (coords.local.x === 0) maybeAffect({ x: coords.chunk.x - 1, y: coords.chunk.y, z: coords.chunk.z });
    if (coords.local.x === CHUNK_SIZE - 1) {
      maybeAffect({ x: coords.chunk.x + 1, y: coords.chunk.y, z: coords.chunk.z });
    }
    if (coords.local.y === 0) maybeAffect({ x: coords.chunk.x, y: coords.chunk.y - 1, z: coords.chunk.z });
    if (coords.local.y === CHUNK_SIZE - 1) {
      maybeAffect({ x: coords.chunk.x, y: coords.chunk.y + 1, z: coords.chunk.z });
    }
    if (coords.local.z === 0) maybeAffect({ x: coords.chunk.x, y: coords.chunk.y, z: coords.chunk.z - 1 });
    if (coords.local.z === CHUNK_SIZE - 1) {
      maybeAffect({ x: coords.chunk.x, y: coords.chunk.y, z: coords.chunk.z + 1 });
    }

    if (inventoryChanged) {
      this.playerInventory.set(entityId, { inventory: nextInventory });
      this.playerPersistence.set(entityId, {
        ...persistence,
        saveDirty: true,
      });
    }

    return {
      changedChunks: [...affected].map((key) => this.toChunkPayload(this.chunks.get(key)!.chunk)),
      inventory: this.cloneInventory(nextInventory),
      inventoryChanged,
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

    for (const [playerName, entityId] of this.playerEntitiesByName) {
      const persistence = this.requireComponent(this.playerPersistence, entityId, "player persistence");
      if (!persistence.saveDirty) {
        continue;
      }

      await this.storage.savePlayer(this.world.name, {
        snapshot: this.getPlayerSnapshot(entityId),
        inventory: this.getInventorySnapshot(entityId),
      });
      this.playerPersistence.set(entityId, {
        saveDirty: false,
        persisted: true,
      });
      this.playerEntitiesByName.set(playerName, entityId);
    }

    this.world = await this.storage.touchWorld(this.world.name, Date.now());
    return {
      world: this.world,
      savedChunks,
    };
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

  private async ensurePlayerEntityLoaded(playerName: PlayerName): Promise<EntityId> {
    const existingEntityId = this.playerEntitiesByName.get(playerName);
    if (existingEntityId) {
      return existingEntityId;
    }

    const persisted = await this.storage.loadPlayer(this.world.name, playerName);
    if (persisted) {
      const { entityId } = persisted.snapshot;
      if (this.entityRegistry.has(entityId)) {
        throw new Error(`Duplicate player entity id "${entityId}" in world "${this.world.name}".`);
      }

      this.entityRegistry.registerExistingEntity(entityId);
      this.playerEntitiesByName.set(playerName, entityId);
      this.playerIdentity.set(entityId, { playerName });
      this.playerTransform.set(entityId, {
        state: this.clonePlayerState(persisted.snapshot.state),
      });
      this.playerMode.set(entityId, {
        gamemode: persisted.snapshot.gamemode,
      });
      this.playerMovement.set(entityId, {
        flying: persisted.snapshot.flying,
      });
      this.playerInventory.set(entityId, {
        inventory: normalizeInventorySnapshot(persisted.inventory),
      });
      this.playerSession.set(entityId, { active: false });
      this.playerPersistence.set(entityId, {
        saveDirty: false,
        persisted: true,
      });
      return entityId;
    }

    const entityId = this.entityRegistry.createEntity("player");
    this.playerEntitiesByName.set(playerName, entityId);
    this.playerIdentity.set(entityId, { playerName });
    this.playerTransform.set(entityId, {
      state: {
        position: [...this.spawnPosition],
        yaw: DEFAULT_PLAYER_YAW,
        pitch: DEFAULT_PLAYER_PITCH,
      },
    });
    this.playerMode.set(entityId, {
      gamemode: DEFAULT_PLAYER_GAMEMODE,
    });
    this.playerMovement.set(entityId, {
      flying: false,
    });
    this.playerInventory.set(entityId, {
      inventory: createDefaultInventory(),
    });
    this.playerSession.set(entityId, { active: false });
    this.playerPersistence.set(entityId, {
      saveDirty: true,
      persisted: false,
    });
    return entityId;
  }

  private getActivePlayerSnapshots(excludeEntityId?: EntityId): PlayerSnapshot[] {
    const snapshots: PlayerSnapshot[] = [];

    for (const entityId of this.playerEntitiesByName.values()) {
      const session = this.requireComponent(this.playerSession, entityId, "player session");
      if (!session.active || entityId === excludeEntityId) {
        continue;
      }

      snapshots.push(this.getPlayerSnapshot(entityId));
    }

    snapshots.sort((left, right) => left.name.localeCompare(right.name));
    return snapshots;
  }

  private getPlayerSnapshot(entityId: EntityId): PlayerSnapshot {
    const identity = this.requireComponent(this.playerIdentity, entityId, "player identity");
    const transform = this.requireComponent(this.playerTransform, entityId, "player transform");
    const mode = this.requireComponent(this.playerMode, entityId, "player mode");
    const movement = this.requireComponent(this.playerMovement, entityId, "player movement");
    const session = this.requireComponent(this.playerSession, entityId, "player session");

    return {
      entityId,
      name: identity.playerName,
      active: session.active,
      gamemode: mode.gamemode,
      flying: movement.flying,
      state: this.clonePlayerState(transform.state),
    };
  }

  private toChunkPayload(chunk: Chunk): ChunkPayload {
    return {
      coord: chunk.coord,
      blocks: chunk.cloneBlocks(),
      revision: chunk.revision,
    };
  }

  private cloneInventory(inventory: InventorySnapshot): InventorySnapshot {
    return normalizeInventorySnapshot(inventory);
  }

  private clonePlayerState(state: PlayerState): PlayerState {
    return {
      position: [...state.position],
      yaw: state.yaw,
      pitch: state.pitch,
    };
  }

  private requireComponent<T>(
    store: ComponentStore<T>,
    entityId: EntityId,
    label: string,
  ): T {
    return store.require(entityId, label);
  }
}
