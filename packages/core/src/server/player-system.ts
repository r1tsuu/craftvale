import type {
  EntityId,
  InventorySnapshot,
  ItemId,
  LivingEntityState,
  PlayerGamemode,
  PlayerName,
  PlayerSnapshot,
} from '../types.ts'
import type { WorldStorage } from './world-storage.ts'

import {
  addInventoryItem,
  createStarterInventory,
  getSelectedInventorySlot,
  interactInventorySlot,
  interactPlayerCraftingInputSlot,
  normalizeInventorySnapshot,
  removeFromSelectedInventorySlot,
  removeInventorySlotCount,
  setSelectedInventorySlot,
  takePlayerCraftingResult,
} from '../world/inventory.ts'
import { type WorldEntityState } from './world-entity-state.ts'

export interface JoinedPlayerState {
  clientPlayer: PlayerSnapshot
  players: PlayerSnapshot[]
  inventory: InventorySnapshot
}

export interface InventoryMutationResult {
  inventory: InventorySnapshot
  inventoryChanged: boolean
}

export interface AddedInventoryItemResult extends InventoryMutationResult {
  added: number
  remaining: number
}

export interface RemovedSelectedInventoryItemResult extends InventoryMutationResult {
  removed: number
}

const DEFAULT_PLAYER_YAW = -Math.PI / 2
const DEFAULT_PLAYER_PITCH = -0.25
const DEFAULT_PLAYER_GAMEMODE: PlayerGamemode = 0

const livingStatesEqual = (left: LivingEntityState, right: LivingEntityState): boolean =>
  left.position[0] === right.position[0] &&
  left.position[1] === right.position[1] &&
  left.position[2] === right.position[2] &&
  left.yaw === right.yaw &&
  left.pitch === right.pitch

const inventoriesEqual = (left: InventorySnapshot, right: InventorySnapshot): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

export class PlayerSystem {
  private readonly playerEntitiesByName = new Map<PlayerName, EntityId>()

  public constructor(
    private readonly worldName: string,
    private readonly storage: WorldStorage,
    private readonly spawnPosition: readonly [number, number, number],
    private readonly entities: WorldEntityState,
    private readonly createInventory: () => InventorySnapshot = createStarterInventory,
  ) {}

  public getPlayerName(entityId: EntityId): PlayerName | null {
    return this.entities.playerIdentity.get(entityId)?.playerName ?? null
  }

  public async joinPlayer(playerName: PlayerName): Promise<JoinedPlayerState> {
    const entityId = await this.ensurePlayerEntityLoaded(playerName)
    const activity = this.requireComponent(
      this.entities.livingActivity,
      entityId,
      'living activity',
    )
    this.entities.livingActivity.set(entityId, {
      ...activity,
      active: true,
    })

    return {
      clientPlayer: this.getPlayerSnapshot(entityId),
      players: this.getActivePlayerSnapshots(entityId),
      inventory: this.getInventorySnapshot(entityId),
    }
  }

  public async leavePlayer(entityId: EntityId): Promise<PlayerSnapshot | null> {
    if (!this.entities.hasPlayerEntity(entityId)) {
      return null
    }

    const activity = this.requireComponent(
      this.entities.livingActivity,
      entityId,
      'living activity',
    )
    if (!activity.active) {
      return this.getPlayerSnapshot(entityId)
    }

    this.entities.livingActivity.set(entityId, {
      ...activity,
      active: false,
    })
    return this.getPlayerSnapshot(entityId)
  }

  public async updatePlayerState(
    entityId: EntityId,
    state: LivingEntityState,
    flying: boolean,
  ): Promise<PlayerSnapshot> {
    const transform = this.requireComponent(
      this.entities.livingTransform,
      entityId,
      'living transform',
    )
    const mode = this.requireComponent(this.entities.playerMode, entityId, 'player mode')
    const movement = this.requireComponent(
      this.entities.playerMovement,
      entityId,
      'player movement',
    )
    const persistence = this.requireComponent(
      this.entities.playerPersistence,
      entityId,
      'player persistence',
    )
    const nextState = this.cloneLivingState(state)
    const nextFlying = mode.gamemode === 1 ? flying : false

    if (!livingStatesEqual(transform.state, nextState) || movement.flying !== nextFlying) {
      this.entities.livingTransform.set(entityId, {
        state: nextState,
      })
      this.entities.playerMovement.set(entityId, {
        flying: nextFlying,
      })
      this.entities.playerPersistence.set(entityId, {
        ...persistence,
        saveDirty: true,
      })
    }

    return this.getPlayerSnapshot(entityId)
  }

  public async setPlayerGamemode(
    entityId: EntityId,
    gamemode: PlayerGamemode,
  ): Promise<PlayerSnapshot> {
    const mode = this.requireComponent(this.entities.playerMode, entityId, 'player mode')
    const movement = this.requireComponent(
      this.entities.playerMovement,
      entityId,
      'player movement',
    )
    const persistence = this.requireComponent(
      this.entities.playerPersistence,
      entityId,
      'player persistence',
    )
    const nextFlying = gamemode === 1 ? movement.flying : false

    if (mode.gamemode !== gamemode || movement.flying !== nextFlying) {
      this.entities.playerMode.set(entityId, { gamemode })
      this.entities.playerMovement.set(entityId, { flying: nextFlying })
      this.entities.playerPersistence.set(entityId, {
        ...persistence,
        saveDirty: true,
      })
    }

    return this.getPlayerSnapshot(entityId)
  }

  public getPlayerSnapshot(entityId: EntityId): PlayerSnapshot {
    const identity = this.requireComponent(
      this.entities.playerIdentity,
      entityId,
      'player identity',
    )
    const transform = this.requireComponent(
      this.entities.livingTransform,
      entityId,
      'living transform',
    )
    const mode = this.requireComponent(this.entities.playerMode, entityId, 'player mode')
    const movement = this.requireComponent(
      this.entities.playerMovement,
      entityId,
      'player movement',
    )
    const activity = this.requireComponent(
      this.entities.livingActivity,
      entityId,
      'living activity',
    )

    return {
      entityId,
      name: identity.playerName,
      active: activity.active,
      gamemode: mode.gamemode,
      flying: movement.flying,
      state: this.cloneLivingState(transform.state),
    }
  }

  public getInventorySnapshot(entityId: EntityId): InventorySnapshot {
    return this.cloneInventory(
      this.requireComponent(this.entities.playerInventory, entityId, 'player inventory').inventory,
    )
  }

  public async selectInventorySlot(entityId: EntityId, slot: number): Promise<InventorySnapshot> {
    const inventory = this.requireComponent(
      this.entities.playerInventory,
      entityId,
      'player inventory',
    )
    const persistence = this.requireComponent(
      this.entities.playerPersistence,
      entityId,
      'player persistence',
    )
    const next = setSelectedInventorySlot(inventory.inventory, slot)

    if (next.selectedSlot !== inventory.inventory.selectedSlot) {
      this.entities.playerInventory.set(entityId, { inventory: next })
      this.entities.playerPersistence.set(entityId, {
        ...persistence,
        saveDirty: true,
      })
      return this.cloneInventory(next)
    }

    return this.cloneInventory(inventory.inventory)
  }

  public async interactInventorySlot(entityId: EntityId, slot: number): Promise<InventorySnapshot> {
    const inventory = this.requireComponent(
      this.entities.playerInventory,
      entityId,
      'player inventory',
    )
    const persistence = this.requireComponent(
      this.entities.playerPersistence,
      entityId,
      'player persistence',
    )
    const next = interactInventorySlot(inventory.inventory, slot)

    if (!inventoriesEqual(next, inventory.inventory)) {
      this.entities.playerInventory.set(entityId, { inventory: next })
      this.entities.playerPersistence.set(entityId, {
        ...persistence,
        saveDirty: true,
      })
      return this.cloneInventory(next)
    }

    return this.cloneInventory(inventory.inventory)
  }

  public setInventorySnapshot(
    entityId: EntityId,
    inventory: InventorySnapshot,
  ): InventoryMutationResult {
    const current = this.requireComponent(
      this.entities.playerInventory,
      entityId,
      'player inventory',
    )
    const persistence = this.requireComponent(
      this.entities.playerPersistence,
      entityId,
      'player persistence',
    )
    const normalized = normalizeInventorySnapshot(inventory)
    if (inventoriesEqual(normalized, current.inventory)) {
      return { inventory: this.cloneInventory(current.inventory), inventoryChanged: false }
    }

    this.entities.playerInventory.set(entityId, { inventory: normalized })
    this.entities.playerPersistence.set(entityId, {
      ...persistence,
      saveDirty: true,
    })
    return {
      inventory: this.cloneInventory(normalized),
      inventoryChanged: true,
    }
  }

  public async interactPlayerCraftingSlot(
    entityId: EntityId,
    slot: number,
  ): Promise<InventorySnapshot> {
    const inventory = this.requireComponent(
      this.entities.playerInventory,
      entityId,
      'player inventory',
    )
    const next = interactPlayerCraftingInputSlot(inventory.inventory, slot)
    return this.setInventorySnapshot(entityId, next).inventory
  }

  public async takePlayerCraftingResult(entityId: EntityId): Promise<InventorySnapshot> {
    const inventory = this.requireComponent(
      this.entities.playerInventory,
      entityId,
      'player inventory',
    )
    const next = takePlayerCraftingResult(inventory.inventory)
    return this.setInventorySnapshot(entityId, next).inventory
  }

  public addInventoryItem(
    entityId: EntityId,
    itemId: ItemId,
    count: number,
  ): AddedInventoryItemResult {
    const inventory = this.requireComponent(
      this.entities.playerInventory,
      entityId,
      'player inventory',
    )
    const persistence = this.requireComponent(
      this.entities.playerPersistence,
      entityId,
      'player persistence',
    )
    const added = addInventoryItem(inventory.inventory, itemId, count)

    if (added.added > 0) {
      this.entities.playerInventory.set(entityId, { inventory: added.inventory })
      this.entities.playerPersistence.set(entityId, {
        ...persistence,
        saveDirty: true,
      })
      return {
        inventory: this.cloneInventory(added.inventory),
        inventoryChanged: true,
        added: added.added,
        remaining: added.remaining,
      }
    }

    return {
      inventory: this.cloneInventory(inventory.inventory),
      inventoryChanged: false,
      added: 0,
      remaining: added.remaining,
    }
  }

  public removeSelectedInventoryItem(
    entityId: EntityId,
    expectedItemId: ItemId,
    count: number,
  ): RemovedSelectedInventoryItemResult {
    const inventory = this.requireComponent(
      this.entities.playerInventory,
      entityId,
      'player inventory',
    )
    const persistence = this.requireComponent(
      this.entities.playerPersistence,
      entityId,
      'player persistence',
    )
    const selectedSlot = getSelectedInventorySlot(inventory.inventory)
    if (selectedSlot.itemId !== expectedItemId || selectedSlot.count < count) {
      return {
        inventory: this.cloneInventory(inventory.inventory),
        inventoryChanged: false,
        removed: 0,
      }
    }

    const next = removeFromSelectedInventorySlot(inventory.inventory, count)
    this.entities.playerInventory.set(entityId, { inventory: next })
    this.entities.playerPersistence.set(entityId, {
      ...persistence,
      saveDirty: true,
    })
    return {
      inventory: this.cloneInventory(next),
      inventoryChanged: true,
      removed: count,
    }
  }

  public removeInventorySlot(
    entityId: EntityId,
    slot: number,
    count: number,
  ): InventoryMutationResult {
    const inventory = this.requireComponent(
      this.entities.playerInventory,
      entityId,
      'player inventory',
    )
    const persistence = this.requireComponent(
      this.entities.playerPersistence,
      entityId,
      'player persistence',
    )
    const next = removeInventorySlotCount(inventory.inventory, slot, count)
    if (inventoriesEqual(next, inventory.inventory)) {
      return { inventory: this.cloneInventory(inventory.inventory), inventoryChanged: false }
    }

    this.entities.playerInventory.set(entityId, { inventory: next })
    this.entities.playerPersistence.set(entityId, { ...persistence, saveDirty: true })
    return { inventory: this.cloneInventory(next), inventoryChanged: true }
  }

  public getSelectedInventorySlot(entityId: EntityId) {
    return getSelectedInventorySlot(
      this.requireComponent(this.entities.playerInventory, entityId, 'player inventory').inventory,
    )
  }

  public getActivePlayers(): PlayerSnapshot[] {
    return this.getActivePlayerSnapshots()
  }

  public async save(): Promise<void> {
    for (const [playerName, entityId] of this.playerEntitiesByName) {
      const persistence = this.requireComponent(
        this.entities.playerPersistence,
        entityId,
        'player persistence',
      )
      if (!persistence.saveDirty) {
        continue
      }

      await this.storage.savePlayer(this.worldName, {
        snapshot: this.getPlayerSnapshot(entityId),
        inventory: this.getInventorySnapshot(entityId),
      })
      this.entities.playerPersistence.set(entityId, {
        saveDirty: false,
        persisted: true,
      })
      this.playerEntitiesByName.set(playerName, entityId)
    }
  }

  private async ensurePlayerEntityLoaded(playerName: PlayerName): Promise<EntityId> {
    const existingEntityId = this.playerEntitiesByName.get(playerName)
    if (existingEntityId) {
      return existingEntityId
    }

    const persisted = await this.storage.loadPlayer(this.worldName, playerName)
    if (persisted) {
      const { entityId } = persisted.snapshot
      if (this.entities.registry.has(entityId)) {
        throw new Error(`Duplicate player entity id "${entityId}" in world "${this.worldName}".`)
      }

      this.entities.registry.registerExistingEntity(entityId)
      this.playerEntitiesByName.set(playerName, entityId)
      this.entities.playerIdentity.set(entityId, { playerName })
      this.entities.livingType.set(entityId, { type: 'player' })
      this.entities.livingTransform.set(entityId, {
        state: this.cloneLivingState(persisted.snapshot.state),
      })
      this.entities.livingActivity.set(entityId, { active: false })
      this.entities.playerMode.set(entityId, {
        gamemode: persisted.snapshot.gamemode,
      })
      this.entities.playerMovement.set(entityId, {
        flying: persisted.snapshot.flying,
      })
      this.entities.playerInventory.set(entityId, {
        inventory: normalizeInventorySnapshot(persisted.inventory),
      })
      this.entities.playerPersistence.set(entityId, {
        saveDirty: false,
        persisted: true,
      })
      return entityId
    }

    const entityId = this.entities.registry.createEntity('player')
    this.playerEntitiesByName.set(playerName, entityId)
    this.entities.playerIdentity.set(entityId, { playerName })
    this.entities.livingType.set(entityId, { type: 'player' })
    this.entities.livingTransform.set(entityId, {
      state: {
        position: [...this.spawnPosition],
        yaw: DEFAULT_PLAYER_YAW,
        pitch: DEFAULT_PLAYER_PITCH,
      },
    })
    this.entities.livingActivity.set(entityId, { active: false })
    this.entities.playerMode.set(entityId, {
      gamemode: DEFAULT_PLAYER_GAMEMODE,
    })
    this.entities.playerMovement.set(entityId, {
      flying: false,
    })
    this.entities.playerInventory.set(entityId, {
      inventory: this.createInventory(),
    })
    this.entities.playerPersistence.set(entityId, {
      saveDirty: true,
      persisted: false,
    })
    return entityId
  }

  private getActivePlayerSnapshots(excludeEntityId?: EntityId): PlayerSnapshot[] {
    const snapshots: PlayerSnapshot[] = []

    for (const entityId of this.playerEntitiesByName.values()) {
      const activity = this.requireComponent(
        this.entities.livingActivity,
        entityId,
        'living activity',
      )
      if (!activity.active || entityId === excludeEntityId) {
        continue
      }

      snapshots.push(this.getPlayerSnapshot(entityId))
    }

    snapshots.sort((left, right) => left.name.localeCompare(right.name))
    return snapshots
  }

  private cloneInventory(inventory: InventorySnapshot): InventorySnapshot {
    return normalizeInventorySnapshot(inventory)
  }

  private cloneLivingState(state: LivingEntityState): LivingEntityState {
    return {
      position: [...state.position],
      yaw: state.yaw,
      pitch: state.pitch,
    }
  }

  private requireComponent<T>(
    store: { require(entityId: EntityId, label: string): T },
    entityId: EntityId,
    label: string,
  ): T {
    return store.require(entityId, label)
  }
}
