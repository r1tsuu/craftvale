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
} from '../types.ts'
import type { WorldStorage } from './world-storage.ts'

import { createDefaultWorldTimeState, type WorldTimeState } from '../shared/lighting.ts'
import { type ChunkPayload, type WorldSummary } from '../shared/messages.ts'
import {
  BLOCK_IDS,
  getDroppedItemIdForBlock,
  isBreakableBlock,
  isCollectibleBlock,
} from '../world/blocks.ts'
import { getChunkCoordsAroundPosition } from '../world/chunk-coords.ts'
import { Chunk } from '../world/chunk.ts'
import {
  CHUNK_SIZE,
  isWithinWorldBlockY,
  STARTUP_CHUNK_RADIUS,
  WORLD_SEA_LEVEL,
} from '../world/constants.ts'
import { getInventorySlot } from '../world/inventory.ts'
import { getPlacedBlockIdForItem, isValidItemId } from '../world/items.ts'
import { createGeneratedChunk, getTerrainHeight } from '../world/terrain.ts'
import { worldToChunkCoord } from '../world/world.ts'
import { BlockEntitySystem } from './block-entity-system.ts'
import { type DroppedItemSimulationResult, DroppedItemSystem } from './dropped-item-system.ts'
import { LightingSystem } from './lighting-system.ts'
import { PlayerSystem } from './player-system.ts'
import { WorldEntityState } from './world-entity-state.ts'
import {
  createEmptyWorldTickResult,
  type QueuedGameplayIntent,
  type WorldInventoryUpdate,
  type WorldTickResult,
} from './world-tick.ts'

interface ServerChunkEntry {
  chunk: Chunk
  hasPersistedRecord: boolean
  hasLightData: boolean
  saveDirty: boolean
}

interface BlockMutationResult {
  changedChunks: ChunkPayload[]
  inventory: InventorySnapshot
  inventoryChanged: boolean
  droppedItems: WorldSimulationResult
}

export interface WorldSimulationResult {
  spawnedDroppedItems: DroppedItemSnapshot[]
  updatedDroppedItems: DroppedItemSnapshot[]
  removedDroppedItemEntityIds: EntityId[]
  inventoryUpdates: WorldInventoryUpdate[]
}

export interface DropItemResult {
  inventory: InventorySnapshot
  inventoryChanged: boolean
  droppedItems: DroppedItemSimulationResult
}

export interface StartupAreaProgress {
  completedChunks: number
  totalChunks: number
}

const chunkKey = ({ x, z }: ChunkCoord): string => `${x},${z}`

const findSpawnColumn = (
  seed: number,
  preferredX: number,
  preferredZ: number,
): {
  x: number
  y: number
  z: number
} => {
  const evaluateColumn = (worldX: number, worldZ: number): { x: number; y: number; z: number } => ({
    x: worldX,
    y: getTerrainHeight(seed, worldX, worldZ),
    z: worldZ,
  })

  const initial = evaluateColumn(preferredX, preferredZ)
  if (initial.y >= WORLD_SEA_LEVEL) {
    return initial
  }

  for (let radius = 1; radius <= 32; radius += 1) {
    let best: { x: number; y: number; z: number } | null = null
    for (let offsetZ = -radius; offsetZ <= radius; offsetZ += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (Math.abs(offsetX) !== radius && Math.abs(offsetZ) !== radius) {
          continue
        }

        const candidate = evaluateColumn(preferredX + offsetX, preferredZ + offsetZ)
        if (candidate.y < WORLD_SEA_LEVEL) {
          continue
        }

        if (!best || candidate.y > best.y) {
          best = candidate
        }
      }
    }

    if (best) {
      return best
    }
  }

  return initial
}

export class AuthoritativeWorld {
  private readonly chunks = new Map<string, ServerChunkEntry>()
  private readonly entityState = new WorldEntityState()
  private readonly playerSystem: PlayerSystem
  private readonly blockEntitySystem: BlockEntitySystem
  private readonly droppedItemSystem: DroppedItemSystem
  private readonly lightingSystem = new LightingSystem()
  private readonly initialization: Promise<void>

  public constructor(
    private world: WorldSummary,
    private readonly storage: WorldStorage,
    options?: { createInventory?: () => InventorySnapshot },
  ) {
    this.playerSystem = new PlayerSystem(
      this.world.name,
      this.storage,
      this.spawnPosition,
      this.entityState,
      options?.createInventory,
    )
    this.blockEntitySystem = new BlockEntitySystem(
      this.world.name,
      this.storage,
      this.entityState,
      {
        getWorld: () => this,
        getActivePlayers: () => this.playerSystem.getActivePlayers(),
        getPlayerSnapshot: (entityId) => this.getPlayerSnapshot(entityId),
      },
    )
    this.droppedItemSystem = new DroppedItemSystem(
      this.world.name,
      this.storage,
      this.entityState,
      (x, y, z) => this.getBlockAt(x, y, z),
    )
    this.initialization = this.initialize()
  }

  public get summary(): WorldSummary {
    return this.world
  }

  public get spawnPosition(): [number, number, number] {
    const spawn = findSpawnColumn(this.world.seed, 8, 8)
    return [spawn.x + 0.5, spawn.y + 1, spawn.z + 0.5]
  }

  public getPlayerName(entityId: EntityId): PlayerName | null {
    return this.playerSystem.getPlayerName(entityId)
  }

  public getPlayerSnapshot(entityId: EntityId): PlayerSnapshot | null {
    if (!this.entityState.hasPlayerEntity(entityId)) {
      return null
    }

    return this.playerSystem.getPlayerSnapshot(entityId)
  }

  public getActivePlayers(): PlayerSnapshot[] {
    return this.playerSystem.getActivePlayers()
  }

  public async joinPlayer(playerName: PlayerName): Promise<{
    clientPlayer: PlayerSnapshot
    players: PlayerSnapshot[]
    inventory: InventorySnapshot
    droppedItems: DroppedItemSnapshot[]
  }> {
    await this.ensureInitialized()
    const joined = await this.playerSystem.joinPlayer(playerName)
    return {
      ...joined,
      droppedItems: await this.droppedItemSystem.getDroppedItemSnapshots(),
    }
  }

  public getStartupChunkCoords(
    position = this.spawnPosition,
    radius = STARTUP_CHUNK_RADIUS,
  ): ChunkCoord[] {
    return getChunkCoordsAroundPosition(position, radius, {
      nearestFirst: true,
    })
  }

  public async pregenerateStartupArea(
    position = this.spawnPosition,
    radius = STARTUP_CHUNK_RADIUS,
    onProgress?: (progress: StartupAreaProgress) => void,
  ): Promise<{
    coords: ChunkCoord[]
    savedChunks: number
  }> {
    await this.ensureInitialized()
    const coords = this.getStartupChunkCoords(position, radius)
    let completedChunks = 0

    onProgress?.({
      completedChunks,
      totalChunks: coords.length,
    })

    let needsRelight = false

    for (const coord of coords) {
      const entry = await this.ensureChunkLoaded(coord, {
        relight: false,
      })
      if (!entry.hasPersistedRecord) {
        entry.saveDirty = true
        needsRelight = true
      } else if (!entry.hasLightData) {
        needsRelight = true
      }

      completedChunks += 1
      onProgress?.({
        completedChunks,
        totalChunks: coords.length,
      })
    }

    if (needsRelight) {
      this.relightLoadedChunks(true)
    }

    return {
      coords,
      savedChunks: await this.flushDirtyChunks(true),
    }
  }

  public async leavePlayer(entityId: EntityId): Promise<PlayerSnapshot | null> {
    await this.ensureInitialized()
    return this.playerSystem.leavePlayer(entityId)
  }

  public async updatePlayerState(
    entityId: EntityId,
    state: PlayerState,
    flying: boolean,
  ): Promise<PlayerSnapshot> {
    await this.ensureInitialized()
    return this.playerSystem.updatePlayerState(entityId, state, flying)
  }

  public async setPlayerGamemode(
    entityId: EntityId,
    gamemode: PlayerGamemode,
  ): Promise<PlayerSnapshot> {
    await this.ensureInitialized()
    return this.playerSystem.setPlayerGamemode(entityId, gamemode)
  }

  public async teleportPlayer(
    entityId: EntityId,
    position: readonly [number, number, number],
  ): Promise<PlayerSnapshot> {
    await this.ensureInitialized()
    const snapshot = this.playerSystem.getPlayerSnapshot(entityId)
    return this.playerSystem.updatePlayerState(
      entityId,
      {
        position: [...position],
        yaw: snapshot.state.yaw,
        pitch: snapshot.state.pitch,
      },
      snapshot.flying,
    )
  }

  public async getChunkPayload(coord: ChunkCoord): Promise<ChunkPayload> {
    await this.ensureInitialized()
    return this.toChunkPayload((await this.ensureChunkLoaded(coord)).chunk)
  }

  public getInventorySnapshot(entityId: EntityId): InventorySnapshot {
    return this.playerSystem.getInventorySnapshot(entityId)
  }

  public async selectInventorySlot(entityId: EntityId, slot: number): Promise<InventorySnapshot> {
    await this.ensureInitialized()
    return this.playerSystem.selectInventorySlot(entityId, slot)
  }

  public async interactInventorySlot(entityId: EntityId, slot: number): Promise<InventorySnapshot> {
    await this.ensureInitialized()
    return this.playerSystem.interactInventorySlot(entityId, slot)
  }

  public async useBlock(
    entityId: EntityId,
    worldX: number,
    worldY: number,
    worldZ: number,
  ): Promise<void> {
    await this.ensureInitialized()
    await this.blockEntitySystem.useBlock(entityId, worldX, worldY, worldZ)
  }

  public async givePlayerItem(
    entityId: EntityId,
    itemId: ItemId,
    count: number,
  ): Promise<{ added: number; remaining: number; inventory: InventorySnapshot }> {
    await this.ensureInitialized()
    if (!isValidItemId(itemId)) {
      throw new Error(`Invalid item ID: ${itemId}`)
    }
    const result = this.playerSystem.addInventoryItem(entityId, itemId, count)
    return { added: result.added, remaining: result.remaining, inventory: result.inventory }
  }

  public async dropItem(entityId: EntityId, slot: number, count: number): Promise<DropItemResult> {
    await this.ensureInitialized()
    const inventory = this.playerSystem.getInventorySnapshot(entityId)
    const slotData = getInventorySlot(inventory, slot)
    if (slotData.count <= 0) {
      return {
        inventory,
        inventoryChanged: false,
        droppedItems: { spawned: [], updated: [], removed: [], inventoryUpdates: [] },
      }
    }

    const dropCount = Math.min(Math.max(1, Math.trunc(count)), slotData.count)
    const mutResult = this.playerSystem.removeInventorySlot(entityId, slot, dropCount)
    const playerSnapshot = this.playerSystem.getPlayerSnapshot(entityId)
    const PLAYER_EYE_HEIGHT = 1.62
    const eyePosition: [number, number, number] = [
      playerSnapshot.state.position[0],
      playerSnapshot.state.position[1] + PLAYER_EYE_HEIGHT,
      playerSnapshot.state.position[2],
    ]
    const droppedItems = await this.droppedItemSystem.spawnPlayerDrop(
      slotData.itemId,
      dropCount,
      eyePosition,
      playerSnapshot.state.yaw,
    )
    return {
      inventory: mutResult.inventory,
      inventoryChanged: mutResult.inventoryChanged,
      droppedItems,
    }
  }

  public getWorldTimeState(): WorldTimeState {
    return this.lightingSystem.getTimeState()
  }

  public async setWorldTime(time: WorldTimeState): Promise<WorldTimeState> {
    await this.ensureInitialized()
    return this.lightingSystem.setTimeState(time)
  }

  public async applyBlockMutation(
    entityId: EntityId,
    worldX: number,
    worldY: number,
    worldZ: number,
    blockId: BlockId,
  ): Promise<BlockMutationResult> {
    await this.ensureInitialized()
    if (!isWithinWorldBlockY(worldY)) {
      return {
        changedChunks: [],
        inventory: this.playerSystem.getInventorySnapshot(entityId),
        inventoryChanged: false,
        droppedItems: this.createEmptyWorldSimulation(),
      }
    }

    const coords = worldToChunkCoord(worldX, worldY, worldZ)
    const entry = await this.ensureChunkLoaded(coords.chunk)
    const current = entry.chunk.get(coords.local.x, coords.local.y, coords.local.z)
    const gamemode = this.playerSystem.getPlayerSnapshot(entityId).gamemode
    let nextInventory = this.playerSystem.getInventorySnapshot(entityId)
    let inventoryChanged = false
    let droppedItems = this.createEmptyWorldSimulation()

    if (blockId === BLOCK_IDS.air) {
      if (current === BLOCK_IDS.air) {
        return {
          changedChunks: [],
          inventory: nextInventory,
          inventoryChanged: false,
          droppedItems: this.createEmptyWorldSimulation(),
        }
      }

      if (!isBreakableBlock(current) && gamemode !== 1) {
        return {
          changedChunks: [],
          inventory: nextInventory,
          inventoryChanged: false,
          droppedItems: this.createEmptyWorldSimulation(),
        }
      }

      const droppedItemId = getDroppedItemIdForBlock(current)
      if (gamemode !== 1 && isCollectibleBlock(current) && droppedItemId !== null) {
        const droppedItemSimulation = await this.droppedItemSystem.spawnBlockDrop(
          droppedItemId,
          1,
          [worldX + 0.5, worldY + 0.75, worldZ + 0.5],
        )
        droppedItems = this.toWorldSimulationResult(droppedItemSimulation)
      }
    } else {
      if (current !== BLOCK_IDS.air && current !== BLOCK_IDS.water) {
        return {
          changedChunks: [],
          inventory: nextInventory,
          inventoryChanged: false,
          droppedItems: this.createEmptyWorldSimulation(),
        }
      }

      const selectedSlot = this.playerSystem.getSelectedInventorySlot(entityId)
      const placedBlockId = getPlacedBlockIdForItem(selectedSlot.itemId)
      if (selectedSlot.count <= 0 || placedBlockId === null || placedBlockId !== blockId) {
        return {
          changedChunks: [],
          inventory: nextInventory,
          inventoryChanged: false,
          droppedItems: this.createEmptyWorldSimulation(),
        }
      }

      if (gamemode !== 1) {
        const removed = this.playerSystem.removeSelectedInventoryItem(
          entityId,
          selectedSlot.itemId,
          1,
        )
        if (removed.removed <= 0) {
          return {
            changedChunks: [],
            inventory: removed.inventory,
            inventoryChanged: false,
            droppedItems: this.createEmptyWorldSimulation(),
          }
        }

        nextInventory = removed.inventory
        inventoryChanged = removed.inventoryChanged
      }
    }

    entry.chunk.set(coords.local.x, coords.local.y, coords.local.z, blockId)
    entry.chunk.revision += 1
    entry.saveDirty = true
    await this.blockEntitySystem.syncBlock(worldX, worldY, worldZ, blockId)

    const lightingChanged = this.relightMutationAffectedChunks(
      coords.chunk,
      coords.local.x,
      coords.local.z,
      true,
    )
    const changedChunks = this.getAffectedChunkPayloads(
      coords.chunk,
      coords.local.x,
      coords.local.z,
    )
    for (const coord of lightingChanged) {
      this.upsertChunk(changedChunks, this.toChunkPayload(this.chunks.get(chunkKey(coord))!.chunk))
    }

    return {
      changedChunks,
      inventory: nextInventory,
      inventoryChanged,
      droppedItems,
    }
  }

  public async save(): Promise<{ world: WorldSummary; savedChunks: number }> {
    await this.ensureInitialized()
    const savedChunks = await this.flushDirtyChunks(false)
    await this.playerSystem.save()
    await this.blockEntitySystem.save()
    await this.droppedItemSystem.save()
    await this.storage.saveWorldTime(this.world.name, this.lightingSystem.getTimeState())
    this.world = await this.storage.touchWorld(this.world.name, Date.now())
    return {
      world: this.world,
      savedChunks,
    }
  }

  public async runTick(
    intents: readonly QueuedGameplayIntent[],
    deltaSeconds: number,
  ): Promise<WorldTickResult> {
    await this.ensureInitialized()
    const result = createEmptyWorldTickResult()

    for (const intent of intents) {
      switch (intent.kind) {
        case 'mutateBlock': {
          const mutation = await this.applyBlockMutation(
            intent.playerEntityId,
            intent.x,
            intent.y,
            intent.z,
            intent.blockId,
          )
          this.mergeBlockMutation(result, intent.playerEntityId, mutation)
          break
        }
        case 'selectInventorySlot': {
          this.mergeInventoryUpdate(
            result,
            intent.playerEntityId,
            await this.selectInventorySlot(intent.playerEntityId, intent.slot),
          )
          break
        }
        case 'useBlock': {
          await this.useBlock(intent.playerEntityId, intent.x, intent.y, intent.z)
          this.drainBlockEntityMessages(result)
          break
        }
        case 'interactInventorySlot': {
          this.mergeInventoryUpdate(
            result,
            intent.playerEntityId,
            await this.interactInventorySlot(intent.playerEntityId, intent.slot),
          )
          break
        }
        case 'updatePlayerState': {
          this.mergePlayerUpdate(
            result,
            await this.updatePlayerState(intent.playerEntityId, intent.state, intent.flying),
          )
          break
        }
        case 'dropItem': {
          const dropped = await this.dropItem(intent.playerEntityId, intent.slot, intent.count)
          if (dropped.inventoryChanged) {
            this.mergeInventoryUpdate(result, intent.playerEntityId, dropped.inventory)
          }
          this.mergeSimulationResult(result, this.toWorldSimulationResult(dropped.droppedItems))
          break
        }
      }
    }

    await this.blockEntitySystem.tick(deltaSeconds)
    this.drainBlockEntityMessages(result)
    this.mergeSimulationResult(result, await this.stepSimulation(deltaSeconds))
    result.worldTime = this.lightingSystem.advanceTime(Math.max(1, Math.round(deltaSeconds * 20)))
    return result
  }

  private async stepSimulation(deltaSeconds: number): Promise<WorldSimulationResult> {
    const result = await this.droppedItemSystem.update(
      Math.max(0, Math.min(deltaSeconds, 0.25)),
      this.playerSystem.getActivePlayers(),
      (playerEntityId, itemId, count) =>
        this.playerSystem.addInventoryItem(playerEntityId, itemId, count),
    )
    return this.toWorldSimulationResult(result)
  }

  private async ensureChunkLoaded(
    coord: ChunkCoord,
    options: {
      relight?: boolean
    } = {},
  ): Promise<ServerChunkEntry> {
    const key = chunkKey(coord)
    const existing = this.chunks.get(key)
    if (existing) {
      return existing
    }

    const persisted = await this.storage.loadChunk(this.world.name, coord)
    const chunk = persisted ? new Chunk(coord) : createGeneratedChunk(coord, this.world.seed)

    if (persisted) {
      chunk.replace(persisted.blocks, persisted.revision, persisted.skyLight, persisted.blockLight)
      chunk.dirty = false
    }

    const entry: ServerChunkEntry = {
      chunk,
      hasPersistedRecord: Boolean(persisted),
      hasLightData: persisted?.hasLightData ?? false,
      saveDirty: false,
    }
    this.chunks.set(key, entry)
    if (options.relight === false) {
      return entry
    }

    if (!persisted || !persisted.hasLightData) {
      const relit = this.relightLoadAffectedChunks(coord, true)
      if (relit.some((value) => chunkKey(value) === key)) {
        entry.saveDirty = true
        this.chunks.set(key, entry)
      }
    }
    return entry
  }

  private toChunkPayload(chunk: Chunk): ChunkPayload {
    return {
      coord: chunk.coord,
      blocks: chunk.cloneBlocks(),
      skyLight: chunk.cloneSkyLight(),
      blockLight: chunk.cloneBlockLight(),
      revision: chunk.revision,
    }
  }

  private getAffectedChunkPayloads(
    chunk: ChunkCoord,
    localX: number,
    localZ: number,
  ): ChunkPayload[] {
    const affected = new Set<string>([chunkKey(chunk)])
    const maybeAffect = (coord: ChunkCoord): void => {
      if (this.chunks.has(chunkKey(coord))) {
        affected.add(chunkKey(coord))
      }
    }

    if (localX === 0) maybeAffect({ x: chunk.x - 1, z: chunk.z })
    if (localX === CHUNK_SIZE - 1) maybeAffect({ x: chunk.x + 1, z: chunk.z })
    if (localZ === 0) maybeAffect({ x: chunk.x, z: chunk.z - 1 })
    if (localZ === CHUNK_SIZE - 1) maybeAffect({ x: chunk.x, z: chunk.z + 1 })

    return [...affected].map((key) => this.toChunkPayload(this.chunks.get(key)!.chunk))
  }

  private getBlockAt(worldX: number, worldY: number, worldZ: number): BlockId {
    if (!isWithinWorldBlockY(worldY)) {
      return BLOCK_IDS.air
    }

    const coords = worldToChunkCoord(worldX, worldY, worldZ)
    const loaded = this.chunks.get(chunkKey(coords.chunk))
    if (loaded) {
      return loaded.chunk.get(coords.local.x, coords.local.y, coords.local.z)
    }

    return createGeneratedChunk(coords.chunk, this.world.seed).get(
      coords.local.x,
      coords.local.y,
      coords.local.z,
    )
  }

  private createEmptyWorldSimulation(): WorldSimulationResult {
    return {
      spawnedDroppedItems: [],
      updatedDroppedItems: [],
      removedDroppedItemEntityIds: [],
      inventoryUpdates: [],
    }
  }

  private toWorldSimulationResult(result: DroppedItemSimulationResult): WorldSimulationResult {
    return {
      spawnedDroppedItems: result.spawned,
      updatedDroppedItems: result.updated,
      removedDroppedItemEntityIds: result.removed,
      inventoryUpdates: result.inventoryUpdates.map(({ playerEntityId, inventory }) => ({
        playerEntityId,
        playerName: this.getPlayerName(playerEntityId) ?? 'Unknown',
        inventory,
      })),
    }
  }

  private mergeBlockMutation(
    result: WorldTickResult,
    playerEntityId: EntityId,
    mutation: BlockMutationResult,
  ): void {
    for (const chunk of mutation.changedChunks) {
      this.upsertChunk(result.changedChunks, chunk)
    }

    if (mutation.inventoryChanged) {
      this.mergeInventoryUpdate(result, playerEntityId, mutation.inventory)
    }

    this.mergeSimulationResult(result, mutation.droppedItems)
  }

  private mergeInventoryUpdate(
    result: WorldTickResult,
    playerEntityId: EntityId,
    inventory: InventorySnapshot,
  ): void {
    const playerName = this.getPlayerName(playerEntityId) ?? 'Unknown'
    const next: WorldInventoryUpdate = {
      playerEntityId,
      playerName,
      inventory,
    }
    const index = result.inventoryUpdates.findIndex(
      (entry) => entry.playerEntityId === playerEntityId,
    )
    if (index >= 0) {
      result.inventoryUpdates[index] = next
      return
    }

    result.inventoryUpdates.push(next)
  }

  private mergePlayerUpdate(result: WorldTickResult, player: PlayerSnapshot): void {
    const index = result.playerUpdates.findIndex((entry) => entry.entityId === player.entityId)
    if (index >= 0) {
      result.playerUpdates[index] = player
      return
    }

    result.playerUpdates.push(player)
  }

  private drainBlockEntityMessages(result: WorldTickResult): void {
    result.chatMessages.push(...this.blockEntitySystem.drainChatMessages())
  }

  private mergeSimulationResult(result: WorldTickResult, simulation: WorldSimulationResult): void {
    for (const update of simulation.inventoryUpdates) {
      this.mergeInventoryUpdate(result, update.playerEntityId, update.inventory)
    }

    for (const item of simulation.spawnedDroppedItems) {
      this.upsertDroppedItem(result.spawnedDroppedItems, item)
      this.removeDroppedItem(result.updatedDroppedItems, item.entityId)
      this.removeRemovedDroppedItem(result.removedDroppedItemEntityIds, item.entityId)
    }

    for (const item of simulation.updatedDroppedItems) {
      if (this.upsertDroppedItem(result.spawnedDroppedItems, item)) {
        continue
      }

      this.upsertDroppedItem(result.updatedDroppedItems, item)
      this.removeRemovedDroppedItem(result.removedDroppedItemEntityIds, item.entityId)
    }

    for (const entityId of simulation.removedDroppedItemEntityIds) {
      this.removeDroppedItem(result.spawnedDroppedItems, entityId)
      this.removeDroppedItem(result.updatedDroppedItems, entityId)
      if (!result.removedDroppedItemEntityIds.includes(entityId)) {
        result.removedDroppedItemEntityIds.push(entityId)
      }
    }
  }

  private upsertChunk(chunks: ChunkPayload[], chunk: ChunkPayload): void {
    const index = chunks.findIndex((entry) => chunkKey(entry.coord) === chunkKey(chunk.coord))
    if (index >= 0) {
      chunks[index] = chunk
      return
    }

    chunks.push(chunk)
  }

  private upsertDroppedItem(collection: DroppedItemSnapshot[], item: DroppedItemSnapshot): boolean {
    const index = collection.findIndex((entry) => entry.entityId === item.entityId)
    if (index >= 0) {
      collection[index] = item
      return true
    }

    collection.push(item)
    return false
  }

  private removeDroppedItem(collection: DroppedItemSnapshot[], entityId: EntityId): void {
    const index = collection.findIndex((entry) => entry.entityId === entityId)
    if (index >= 0) {
      collection.splice(index, 1)
    }
  }

  private removeRemovedDroppedItem(collection: EntityId[], entityId: EntityId): void {
    const index = collection.indexOf(entityId)
    if (index >= 0) {
      collection.splice(index, 1)
    }
  }

  private async flushDirtyChunks(touchWorld: boolean): Promise<number> {
    let savedChunks = 0

    for (const [key, entry] of this.chunks) {
      if (!entry.saveDirty) {
        continue
      }

      await this.storage.saveChunk(this.world.name, {
        coord: entry.chunk.coord,
        blocks: entry.chunk.cloneBlocks(),
        skyLight: entry.chunk.cloneSkyLight(),
        blockLight: entry.chunk.cloneBlockLight(),
        hasLightData: true,
        revision: entry.chunk.revision,
      })
      entry.hasPersistedRecord = true
      entry.hasLightData = true
      savedChunks += 1

      entry.saveDirty = false
      this.chunks.set(key, entry)
    }

    if (touchWorld && savedChunks > 0) {
      this.world = await this.storage.touchWorld(this.world.name, Date.now())
    }

    return savedChunks
  }

  private async initialize(): Promise<void> {
    const storedTime = await this.storage.loadWorldTime(this.world.name)
    this.lightingSystem.setTimeState(storedTime ?? createDefaultWorldTimeState())
  }

  private async ensureInitialized(): Promise<void> {
    await this.initialization
  }

  private relightLoadedChunks(persistChanges: boolean): ChunkCoord[] {
    const loadedChunks = [...this.chunks.values()].map((entry) => entry.chunk)
    return this.relightChunkSet(loadedChunks, persistChanges)
  }

  private relightLoadAffectedChunks(center: ChunkCoord, persistChanges: boolean): ChunkCoord[] {
    return this.relightChunkSet(
      this.getLoadedChunksForRelight(center, {
        includeOrthogonalNeighbors: true,
      }),
      persistChanges,
    )
  }

  private relightMutationAffectedChunks(
    center: ChunkCoord,
    localX: number,
    localZ: number,
    persistChanges: boolean,
  ): ChunkCoord[] {
    return this.relightChunkSet(
      this.getLoadedChunksForRelight(center, {
        localX,
        localZ,
      }),
      persistChanges,
    )
  }

  private getLoadedChunksForRelight(
    center: ChunkCoord,
    options: {
      includeOrthogonalNeighbors?: boolean
      localX?: number
      localZ?: number
    } = {},
  ): Chunk[] {
    const keys = new Set<string>([chunkKey(center)])
    const maybeAdd = (coord: ChunkCoord): void => {
      if (this.chunks.has(chunkKey(coord))) {
        keys.add(chunkKey(coord))
      }
    }

    if (options.includeOrthogonalNeighbors || options.localX === 0) {
      maybeAdd({ x: center.x - 1, z: center.z })
    }
    if (options.includeOrthogonalNeighbors || options.localX === CHUNK_SIZE - 1) {
      maybeAdd({ x: center.x + 1, z: center.z })
    }
    if (options.includeOrthogonalNeighbors || options.localZ === 0) {
      maybeAdd({ x: center.x, z: center.z - 1 })
    }
    if (options.includeOrthogonalNeighbors || options.localZ === CHUNK_SIZE - 1) {
      maybeAdd({ x: center.x, z: center.z + 1 })
    }

    return [...keys]
      .map((key) => this.chunks.get(key)?.chunk ?? null)
      .filter((chunk): chunk is Chunk => chunk !== null)
  }

  private relightChunkSet(chunks: readonly Chunk[], persistChanges: boolean): ChunkCoord[] {
    const generatedChunkCache = new Map<string, Chunk>()
    const resolveChunk = (coord: ChunkCoord): Chunk => {
      const loaded = this.chunks.get(chunkKey(coord))
      if (loaded) {
        return loaded.chunk
      }

      const key = chunkKey(coord)
      let generated = generatedChunkCache.get(key)
      if (!generated) {
        generated = createGeneratedChunk(coord, this.world.seed)
        generatedChunkCache.set(key, generated)
      }

      return generated
    }

    const changed = this.lightingSystem.relightLoadedChunks(
      chunks,
      (worldX, worldY, worldZ) => {
        if (!isWithinWorldBlockY(worldY)) {
          return BLOCK_IDS.air
        }

        const coords = worldToChunkCoord(worldX, worldY, worldZ)
        return resolveChunk(coords.chunk).get(coords.local.x, coords.local.y, coords.local.z)
      },
      (coord) => resolveChunk(coord),
    )
    if (!persistChanges) {
      return changed
    }

    for (const coord of changed) {
      const entry = this.chunks.get(chunkKey(coord))
      if (!entry) {
        continue
      }

      entry.saveDirty = true
      entry.hasLightData = true
      this.chunks.set(chunkKey(coord), entry)
    }

    return changed
  }
}
