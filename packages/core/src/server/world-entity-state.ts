import type {
  BlockEntityType,
  EntityId,
  InventorySlot,
  InventorySnapshot,
  ItemId,
  PlayerGamemode,
  PlayerName,
  PlayerState,
} from '../types.ts'

import { ComponentStore, EntityRegistry } from './entity-system.ts'

export interface PlayerIdentityComponent {
  playerName: PlayerName
}

export interface TransformComponent {
  state: PlayerState
}

export interface PlayerModeComponent {
  gamemode: PlayerGamemode
}

export interface MovementStateComponent {
  flying: boolean
}

export interface InventoryComponent {
  inventory: InventorySnapshot
}

export interface SessionPresenceComponent {
  active: boolean
}

export interface PersistenceComponent {
  saveDirty: boolean
  persisted: boolean
}

export interface DroppedItemTransformComponent {
  position: [number, number, number]
  velocity: [number, number, number]
}

export interface DroppedItemStackComponent {
  itemId: ItemId
  count: number
}

export interface DroppedItemLifecycleComponent {
  pickupCooldownMs: number
}

export interface BlockEntityTypeComponent {
  type: BlockEntityType
}

export interface BlockEntityPositionComponent {
  x: number
  y: number
  z: number
}

export interface BlockEntityInventoryComponent {
  slots: InventorySlot[]
}

export class WorldEntityState {
  public readonly registry = new EntityRegistry()
  public readonly playerIdentity = new ComponentStore<PlayerIdentityComponent>()
  public readonly playerTransform = new ComponentStore<TransformComponent>()
  public readonly playerMode = new ComponentStore<PlayerModeComponent>()
  public readonly playerMovement = new ComponentStore<MovementStateComponent>()
  public readonly playerInventory = new ComponentStore<InventoryComponent>()
  public readonly playerSession = new ComponentStore<SessionPresenceComponent>()
  public readonly playerPersistence = new ComponentStore<PersistenceComponent>()
  public readonly droppedItemTransform = new ComponentStore<DroppedItemTransformComponent>()
  public readonly droppedItemStack = new ComponentStore<DroppedItemStackComponent>()
  public readonly droppedItemLifecycle = new ComponentStore<DroppedItemLifecycleComponent>()
  public readonly blockEntityType = new ComponentStore<BlockEntityTypeComponent>()
  public readonly blockEntityPosition = new ComponentStore<BlockEntityPositionComponent>()
  public readonly blockEntityInventory = new ComponentStore<BlockEntityInventoryComponent>()

  public hasPlayerEntity(entityId: EntityId): boolean {
    return this.registry.has(entityId) && this.playerIdentity.get(entityId) !== undefined
  }

  public hasDroppedItemEntity(entityId: EntityId): boolean {
    return this.registry.has(entityId) && this.droppedItemStack.get(entityId) !== undefined
  }

  public hasBlockEntity(entityId: EntityId): boolean {
    return this.registry.has(entityId) && this.blockEntityType.get(entityId) !== undefined
  }
}
