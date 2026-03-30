import type {
  BlockEntityType,
  EntityId,
  InventorySlot,
  InventorySnapshot,
  ItemId,
  LivingEntityState,
  LivingEntityType,
  PlayerGamemode,
  PlayerName,
} from '../types.ts'

import { ComponentStore, EntityRegistry } from './entity-system.ts'

export interface PlayerIdentityComponent {
  playerName: PlayerName
}

export interface LivingTypeComponent {
  type: LivingEntityType
}

export interface LivingTransformComponent {
  state: LivingEntityState
}

export interface LivingActivityComponent {
  active: boolean
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

export interface PigWanderComponent {
  mode: 'idle' | 'walk'
  remainingSeconds: number
  targetYaw: number
  prngState: number
}

export class WorldEntityState {
  public readonly registry = new EntityRegistry()
  public readonly playerIdentity = new ComponentStore<PlayerIdentityComponent>()
  public readonly livingType = new ComponentStore<LivingTypeComponent>()
  public readonly livingTransform = new ComponentStore<LivingTransformComponent>()
  public readonly livingActivity = new ComponentStore<LivingActivityComponent>()
  public readonly playerMode = new ComponentStore<PlayerModeComponent>()
  public readonly playerMovement = new ComponentStore<MovementStateComponent>()
  public readonly playerInventory = new ComponentStore<InventoryComponent>()
  public readonly playerPersistence = new ComponentStore<PersistenceComponent>()
  public readonly pigWander = new ComponentStore<PigWanderComponent>()
  public readonly droppedItemTransform = new ComponentStore<DroppedItemTransformComponent>()
  public readonly droppedItemStack = new ComponentStore<DroppedItemStackComponent>()
  public readonly droppedItemLifecycle = new ComponentStore<DroppedItemLifecycleComponent>()
  public readonly blockEntityType = new ComponentStore<BlockEntityTypeComponent>()
  public readonly blockEntityPosition = new ComponentStore<BlockEntityPositionComponent>()
  public readonly blockEntityInventory = new ComponentStore<BlockEntityInventoryComponent>()

  public hasLivingEntity(entityId: EntityId): boolean {
    return this.registry.has(entityId) && this.livingType.get(entityId) !== undefined
  }

  public hasPlayerEntity(entityId: EntityId): boolean {
    return (
      this.registry.has(entityId) &&
      this.playerIdentity.get(entityId) !== undefined &&
      this.livingType.get(entityId)?.type === 'player'
    )
  }

  public hasPigEntity(entityId: EntityId): boolean {
    return this.registry.has(entityId) && this.livingType.get(entityId)?.type === 'pig'
  }

  public hasDroppedItemEntity(entityId: EntityId): boolean {
    return this.registry.has(entityId) && this.droppedItemStack.get(entityId) !== undefined
  }

  public hasBlockEntity(entityId: EntityId): boolean {
    return this.registry.has(entityId) && this.blockEntityType.get(entityId) !== undefined
  }
}
