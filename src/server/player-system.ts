import type {
  BlockId,
  EntityId,
  InventorySnapshot,
  PlayerGamemode,
  PlayerName,
  PlayerSnapshot,
  PlayerState,
} from "../types.ts";
import {
  addInventoryItem,
  createDefaultInventory,
  getSelectedInventorySlot,
  interactInventorySlot,
  normalizeInventorySnapshot,
  removeFromSelectedInventorySlot,
  setSelectedInventorySlot,
} from "../world/inventory.ts";
import { ComponentStore, EntityRegistry } from "./entity-system.ts";
import type { WorldStorage } from "./world-storage.ts";

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

export interface JoinedPlayerState {
  clientPlayer: PlayerSnapshot;
  players: PlayerSnapshot[];
  inventory: InventorySnapshot;
}

export interface InventoryMutationResult {
  inventory: InventorySnapshot;
  inventoryChanged: boolean;
}

export interface AddedInventoryItemResult extends InventoryMutationResult {
  added: number;
  remaining: number;
}

export interface RemovedSelectedInventoryItemResult extends InventoryMutationResult {
  removed: number;
}

const DEFAULT_PLAYER_YAW = -Math.PI / 2;
const DEFAULT_PLAYER_PITCH = -0.25;
const DEFAULT_PLAYER_GAMEMODE: PlayerGamemode = 0;

const playerStatesEqual = (left: PlayerState, right: PlayerState): boolean =>
  left.position[0] === right.position[0] &&
  left.position[1] === right.position[1] &&
  left.position[2] === right.position[2] &&
  left.yaw === right.yaw &&
  left.pitch === right.pitch;

const inventoriesEqual = (left: InventorySnapshot, right: InventorySnapshot): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export class PlayerSystem {
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
    private readonly worldName: string,
    private readonly storage: WorldStorage,
    private readonly spawnPosition: readonly [number, number, number],
  ) {}

  public getPlayerName(entityId: EntityId): PlayerName | null {
    return this.playerIdentity.get(entityId)?.playerName ?? null;
  }

  public async joinPlayer(playerName: PlayerName): Promise<JoinedPlayerState> {
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

  public getPlayerSnapshot(entityId: EntityId): PlayerSnapshot {
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

  public addInventoryItem(
    entityId: EntityId,
    blockId: BlockId,
    count: number,
  ): AddedInventoryItemResult {
    const inventory = this.requireComponent(this.playerInventory, entityId, "player inventory");
    const persistence = this.requireComponent(this.playerPersistence, entityId, "player persistence");
    const added = addInventoryItem(inventory.inventory, blockId, count);

    if (added.added > 0) {
      this.playerInventory.set(entityId, { inventory: added.inventory });
      this.playerPersistence.set(entityId, {
        ...persistence,
        saveDirty: true,
      });
      return {
        inventory: this.cloneInventory(added.inventory),
        inventoryChanged: true,
        added: added.added,
        remaining: added.remaining,
      };
    }

    return {
      inventory: this.cloneInventory(inventory.inventory),
      inventoryChanged: false,
      added: 0,
      remaining: added.remaining,
    };
  }

  public removeSelectedInventoryItem(
    entityId: EntityId,
    expectedBlockId: BlockId,
    count: number,
  ): RemovedSelectedInventoryItemResult {
    const inventory = this.requireComponent(this.playerInventory, entityId, "player inventory");
    const persistence = this.requireComponent(this.playerPersistence, entityId, "player persistence");
    const selectedSlot = getSelectedInventorySlot(inventory.inventory);
    if (selectedSlot.blockId !== expectedBlockId || selectedSlot.count < count) {
      return {
        inventory: this.cloneInventory(inventory.inventory),
        inventoryChanged: false,
        removed: 0,
      };
    }

    const next = removeFromSelectedInventorySlot(inventory.inventory, count);
    this.playerInventory.set(entityId, { inventory: next });
    this.playerPersistence.set(entityId, {
      ...persistence,
      saveDirty: true,
    });
    return {
      inventory: this.cloneInventory(next),
      inventoryChanged: true,
      removed: count,
    };
  }

  public getSelectedInventorySlot(entityId: EntityId) {
    return getSelectedInventorySlot(
      this.requireComponent(this.playerInventory, entityId, "player inventory").inventory,
    );
  }

  public async save(): Promise<void> {
    for (const [playerName, entityId] of this.playerEntitiesByName) {
      const persistence = this.requireComponent(this.playerPersistence, entityId, "player persistence");
      if (!persistence.saveDirty) {
        continue;
      }

      await this.storage.savePlayer(this.worldName, {
        snapshot: this.getPlayerSnapshot(entityId),
        inventory: this.getInventorySnapshot(entityId),
      });
      this.playerPersistence.set(entityId, {
        saveDirty: false,
        persisted: true,
      });
      this.playerEntitiesByName.set(playerName, entityId);
    }
  }

  private async ensurePlayerEntityLoaded(playerName: PlayerName): Promise<EntityId> {
    const existingEntityId = this.playerEntitiesByName.get(playerName);
    if (existingEntityId) {
      return existingEntityId;
    }

    const persisted = await this.storage.loadPlayer(this.worldName, playerName);
    if (persisted) {
      const { entityId } = persisted.snapshot;
      if (this.entityRegistry.has(entityId)) {
        throw new Error(`Duplicate player entity id "${entityId}" in world "${this.worldName}".`);
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
