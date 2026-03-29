import type { BlockEntityType, BlockId, ChatEntry, EntityId, PlayerSnapshot } from '../types.ts'
import type { AuthoritativeWorld } from './authoritative-world.ts'
import type { WorldEntityState } from './world-entity-state.ts'
import type { StoredBlockEntityRecord, WorldStorage } from './world-storage.ts'

import { BLOCK_IDS } from '../world/blocks.ts'

export interface BlockEntityChatMessage {
  targetPlayerEntityId: EntityId | null
  entry: ChatEntry
}

interface BlockEntityRuntimeContext {
  getWorld(): AuthoritativeWorld
  getActivePlayers(): PlayerSnapshot[]
  getPlayerSnapshot(entityId: EntityId): PlayerSnapshot | null
}

interface BlockEntityBehaviorContext {
  system: BlockEntitySystem
  world: AuthoritativeWorld
  blockEntityId: EntityId
  type: BlockEntityType
  position: readonly [number, number, number]
  getActivePlayers(): PlayerSnapshot[]
  getPlayerSnapshot(entityId: EntityId): PlayerSnapshot | null
  emitChatMessage(targetPlayerEntityId: EntityId | null, entry: ChatEntry): void
  emitSystemMessage(text: string, options?: { targetPlayerEntityId?: EntityId | null }): void
}

interface BlockEntityUseContext extends BlockEntityBehaviorContext {
  playerEntityId: EntityId
}

interface BlockEntityTickContext extends BlockEntityBehaviorContext {
  deltaSeconds: number
}

interface BlockEntityBehavior {
  type: BlockEntityType
  blockId: BlockId
  onUse?(context: BlockEntityUseContext): void | Promise<void>
  onTick?(context: BlockEntityTickContext): void | Promise<void>
}

const positionKey = (x: number, y: number, z: number): string => `${x},${y},${z}`

const clonePosition = (position: readonly [number, number, number]): [number, number, number] => [
  position[0],
  position[1],
  position[2],
]

const BLOCK_ENTITY_BEHAVIORS: Record<BlockEntityType, BlockEntityBehavior> = {
  craftingTable: {
    type: 'craftingTable',
    blockId: BLOCK_IDS.craftingTable,
    onUse: (context) => {
      context.emitSystemMessage('CRAFTING TGABLE WAS CLICKED (TEMPORARY)', {
        targetPlayerEntityId: context.playerEntityId,
      })
    },
  },
}

const BLOCK_ENTITY_BEHAVIORS_BY_BLOCK_ID = new Map<BlockId, BlockEntityBehavior>(
  Object.values(BLOCK_ENTITY_BEHAVIORS).map((behavior) => [behavior.blockId, behavior]),
)

export class BlockEntitySystem {
  private readonly positionIndex = new Map<string, EntityId>()
  private readonly pendingChatMessages: BlockEntityChatMessage[] = []
  private loadPromise: Promise<void> | null = null
  private saveDirty = false

  public constructor(
    public readonly worldName: string,
    public readonly storage: WorldStorage,
    public readonly entities: WorldEntityState,
    private readonly runtime: BlockEntityRuntimeContext,
  ) {}

  public async syncBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    blockId: BlockId,
  ): Promise<void> {
    await this.ensureLoaded()
    const key = positionKey(worldX, worldY, worldZ)
    const existingEntityId = this.positionIndex.get(key) ?? null
    const behavior = BLOCK_ENTITY_BEHAVIORS_BY_BLOCK_ID.get(blockId) ?? null

    if (!behavior) {
      if (existingEntityId) {
        this.removeEntity(existingEntityId)
      }
      return
    }

    if (existingEntityId) {
      const existingType = this.entities.blockEntityType.require(
        existingEntityId,
        'block entity type',
      ).type
      if (existingType === behavior.type) {
        return
      }

      this.removeEntity(existingEntityId)
    }

    this.createEntity(behavior.type, [worldX, worldY, worldZ])
  }

  public getEntityIdAt(worldX: number, worldY: number, worldZ: number): EntityId | null {
    return this.positionIndex.get(positionKey(worldX, worldY, worldZ)) ?? null
  }

  public getEntityType(entityId: EntityId): BlockEntityType {
    return this.entities.blockEntityType.require(entityId, 'block entity type').type
  }

  public getEntityPosition(entityId: EntityId): [number, number, number] {
    const position = this.entities.blockEntityPosition.require(entityId, 'block entity position')
    return [position.x, position.y, position.z]
  }

  public async useBlock(
    playerEntityId: EntityId,
    worldX: number,
    worldY: number,
    worldZ: number,
  ): Promise<void> {
    await this.ensureLoaded()
    const entityId = this.getEntityIdAt(worldX, worldY, worldZ)
    if (!entityId) {
      return
    }

    const type = this.getEntityType(entityId)
    const behavior = BLOCK_ENTITY_BEHAVIORS[type]
    if (!behavior.onUse) {
      return
    }

    await behavior.onUse({
      ...this.createActionContext(entityId, type, this.getEntityPosition(entityId)),
      playerEntityId,
    })
  }

  public async tick(deltaSeconds: number): Promise<void> {
    await this.ensureLoaded()

    for (const [entityId, typeComponent] of this.entities.blockEntityType.entries()) {
      const behavior = BLOCK_ENTITY_BEHAVIORS[typeComponent.type]
      if (!behavior.onTick) {
        continue
      }

      await behavior.onTick({
        ...this.createActionContext(entityId, typeComponent.type, this.getEntityPosition(entityId)),
        deltaSeconds,
      })
    }
  }

  public async save(): Promise<void> {
    await this.ensureLoaded()
    if (!this.saveDirty) {
      return
    }

    await this.storage.saveBlockEntities(this.worldName, this.collectRecords())
    this.saveDirty = false
  }

  public drainChatMessages(): BlockEntityChatMessage[] {
    return this.pendingChatMessages.splice(0)
  }

  private createActionContext(
    blockEntityId: EntityId,
    type: BlockEntityType,
    position: readonly [number, number, number],
  ): BlockEntityBehaviorContext {
    const world = this.runtime.getWorld()
    return {
      system: this,
      world,
      blockEntityId,
      type,
      position,
      getActivePlayers: () => this.runtime.getActivePlayers(),
      getPlayerSnapshot: (entityId) => this.runtime.getPlayerSnapshot(entityId),
      emitChatMessage: (targetPlayerEntityId, entry) => {
        this.pendingChatMessages.push({
          targetPlayerEntityId,
          entry,
        })
      },
      emitSystemMessage: (text, options = {}) => {
        this.pendingChatMessages.push({
          targetPlayerEntityId: options.targetPlayerEntityId ?? null,
          entry: {
            kind: 'system',
            text,
            receivedAt: Date.now(),
          },
        })
      },
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadPersistedEntities()
    }
    await this.loadPromise
  }

  private async loadPersistedEntities(): Promise<void> {
    const records = await this.storage.loadBlockEntities(this.worldName)

    for (const record of records) {
      if (this.entities.registry.has(record.entityId)) {
        throw new Error(
          `Duplicate block entity id "${record.entityId}" in world "${this.worldName}".`,
        )
      }

      const key = positionKey(record.x, record.y, record.z)
      if (this.positionIndex.has(key)) {
        throw new Error(`Duplicate block entity position "${key}" in world "${this.worldName}".`)
      }

      this.entities.registry.registerExistingEntity(record.entityId)
      this.entities.blockEntityType.set(record.entityId, { type: record.type })
      this.entities.blockEntityPosition.set(record.entityId, {
        x: record.x,
        y: record.y,
        z: record.z,
      })
      this.positionIndex.set(key, record.entityId)
    }
  }

  private collectRecords(): StoredBlockEntityRecord[] {
    const records: StoredBlockEntityRecord[] = []

    for (const [entityId, type] of this.entities.blockEntityType.entries()) {
      const position = this.entities.blockEntityPosition.require(entityId, 'block entity position')
      records.push({
        entityId,
        type: type.type,
        x: position.x,
        y: position.y,
        z: position.z,
      })
    }

    records.sort((left, right) => left.entityId.localeCompare(right.entityId))
    return records
  }

  private createEntity(
    type: BlockEntityType,
    position: readonly [number, number, number],
  ): EntityId {
    const entityId = this.entities.registry.createEntity('block')
    const [x, y, z] = clonePosition(position)
    this.entities.blockEntityType.set(entityId, { type })
    this.entities.blockEntityPosition.set(entityId, { x, y, z })
    this.positionIndex.set(positionKey(x, y, z), entityId)
    this.saveDirty = true
    return entityId
  }

  private removeEntity(entityId: EntityId): void {
    const position = this.entities.blockEntityPosition.get(entityId)
    if (position) {
      this.positionIndex.delete(positionKey(position.x, position.y, position.z))
    }

    this.entities.blockEntityType.delete(entityId)
    this.entities.blockEntityPosition.delete(entityId)
    this.entities.registry.destroyEntity(entityId)
    this.saveDirty = true
  }
}
