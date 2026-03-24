import type {
  EntityId,
  InventorySnapshot,
  PlayerGamemode,
  PlayerName,
  PlayerState,
} from "../types.ts";
import { ComponentStore, EntityRegistry } from "./entity-system.ts";

export interface PlayerIdentityComponent {
  playerName: PlayerName;
}

export interface TransformComponent {
  state: PlayerState;
}

export interface PlayerModeComponent {
  gamemode: PlayerGamemode;
}

export interface MovementStateComponent {
  flying: boolean;
}

export interface InventoryComponent {
  inventory: InventorySnapshot;
}

export interface SessionPresenceComponent {
  active: boolean;
}

export interface PersistenceComponent {
  saveDirty: boolean;
  persisted: boolean;
}

export class WorldEntityState {
  public readonly registry = new EntityRegistry();
  public readonly playerIdentity = new ComponentStore<PlayerIdentityComponent>();
  public readonly playerTransform = new ComponentStore<TransformComponent>();
  public readonly playerMode = new ComponentStore<PlayerModeComponent>();
  public readonly playerMovement = new ComponentStore<MovementStateComponent>();
  public readonly playerInventory = new ComponentStore<InventoryComponent>();
  public readonly playerSession = new ComponentStore<SessionPresenceComponent>();
  public readonly playerPersistence = new ComponentStore<PersistenceComponent>();

  public hasPlayerEntity(entityId: EntityId): boolean {
    return this.registry.has(entityId) && this.playerIdentity.get(entityId) !== undefined;
  }
}
