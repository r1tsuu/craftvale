import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { WorldSummary } from '../shared/messages.ts'
import type {
  BlockEntityType,
  ChunkCoord,
  DroppedItemSnapshot,
  EntityId,
  InventorySlot,
  InventorySnapshot,
  ItemId,
  PlayerGamemode,
  PlayerName,
  PlayerSnapshot,
} from '../types.ts'

import { normalizeWorldTimeState, type WorldTimeState } from '../shared/lighting.ts'
import {
  CRAFTING_TABLE_INPUT_SLOT_COUNT,
  PLAYER_CRAFTING_INPUT_SLOT_COUNT,
} from '../world/crafting.ts'
import {
  createEmptyInventorySlot,
  normalizeInventorySlotArray,
  normalizeInventorySnapshot,
} from '../world/inventory.ts'

const REGISTRY_MAGIC = 'VWRG'
const CHUNK_MAGIC = 'VCHK'
const PLAYER_MAGIC = 'VPLY'
const DROPPED_ITEMS_MAGIC = 'VDRP'
const BLOCK_ENTITIES_MAGIC = 'VBEN'
const WORLD_TIME_MAGIC = 'VTIM'
const REGISTRY_VERSION = 1
const CHUNK_VERSION = 3
const PLAYER_VERSION = 7
const DROPPED_ITEMS_VERSION = 2
const BLOCK_ENTITIES_VERSION = 2
const WORLD_TIME_VERSION = 1

export interface StoredWorldRecord extends WorldSummary {
  directoryName: string
}

export interface StoredChunkRecord {
  coord: ChunkCoord
  blocks: Uint8Array
  skyLight?: Uint8Array
  blockLight?: Uint8Array
  hasLightData?: boolean
  revision: number
}

export interface StoredPlayerRecord {
  snapshot: PlayerSnapshot
  inventory: InventorySnapshot
}

export interface StoredDroppedItemRecord {
  snapshot: DroppedItemSnapshot
}

export interface StoredBlockEntityRecord {
  entityId: EntityId
  type: BlockEntityType
  x: number
  y: number
  z: number
  slots: InventorySlot[]
}

export interface WorldStorage {
  listWorlds(): Promise<WorldSummary[]>
  getWorld(name: string): Promise<StoredWorldRecord | null>
  createWorld(name: string, seed: number): Promise<StoredWorldRecord>
  deleteWorld(name: string): Promise<boolean>
  loadChunk(worldName: string, coord: ChunkCoord): Promise<StoredChunkRecord | null>
  saveChunk(worldName: string, chunk: StoredChunkRecord): Promise<void>
  deleteChunk(worldName: string, coord: ChunkCoord): Promise<void>
  loadPlayer(worldName: string, playerName: PlayerName): Promise<StoredPlayerRecord | null>
  savePlayer(worldName: string, player: StoredPlayerRecord): Promise<void>
  loadDroppedItems(worldName: string): Promise<DroppedItemSnapshot[]>
  saveDroppedItems(worldName: string, items: readonly DroppedItemSnapshot[]): Promise<void>
  loadBlockEntities(worldName: string): Promise<StoredBlockEntityRecord[]>
  saveBlockEntities(worldName: string, entities: readonly StoredBlockEntityRecord[]): Promise<void>
  loadWorldTime(worldName: string): Promise<WorldTimeState | null>
  saveWorldTime(worldName: string, time: WorldTimeState): Promise<void>
  touchWorld(worldName: string, updatedAt?: number): Promise<StoredWorldRecord>
}

export const DEDICATED_WORLD_DIRECTORY_NAME = 'world'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const chunkFilename = (coord: ChunkCoord): string => `${coord.x}_${coord.z}.bin`
const playerFilename = (playerName: PlayerName): string => `${encodeURIComponent(playerName)}.bin`
const droppedItemsFilename = (): string => 'dropped-items.bin'
const blockEntitiesFilename = (): string => 'block-entities.bin'
const worldTimeFilename = (): string => 'time.bin'

const writeString = (target: Uint8Array, offset: number, value: string): number => {
  const bytes = textEncoder.encode(value)
  const view = new DataView(target.buffer, target.byteOffset, target.byteLength)
  view.setUint16(offset, bytes.length, true)
  target.set(bytes, offset + 2)
  return offset + 2 + bytes.length
}

const readString = (source: Uint8Array, offset: number): { value: string; nextOffset: number } => {
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength)
  const length = view.getUint16(offset, true)
  const start = offset + 2
  const end = start + length
  return {
    value: textDecoder.decode(source.subarray(start, end)),
    nextOffset: end,
  }
}

const encodeRegistry = (worlds: readonly StoredWorldRecord[]): Uint8Array => {
  const strings = worlds.map((world) => ({
    name: textEncoder.encode(world.name),
    directoryName: textEncoder.encode(world.directoryName),
  }))
  const totalSize =
    12 +
    strings.reduce(
      (size, value) => size + 2 + value.name.length + 2 + value.directoryName.length + 4 + 8 + 8,
      0,
    )
  const bytes = new Uint8Array(totalSize)
  const view = new DataView(bytes.buffer)
  bytes.set(textEncoder.encode(REGISTRY_MAGIC), 0)
  view.setUint32(4, REGISTRY_VERSION, true)
  view.setUint32(8, worlds.length, true)

  let offset = 12
  for (let index = 0; index < worlds.length; index += 1) {
    const world = worlds[index]
    offset = writeString(bytes, offset, world.name)
    offset = writeString(bytes, offset, world.directoryName)
    view.setUint32(offset, world.seed >>> 0, true)
    offset += 4
    view.setFloat64(offset, world.createdAt, true)
    offset += 8
    view.setFloat64(offset, world.updatedAt, true)
    offset += 8
  }

  return bytes
}

const decodeRegistry = (bytes: Uint8Array): StoredWorldRecord[] => {
  if (bytes.byteLength < 12) {
    throw new Error('World registry is truncated.')
  }

  const magic = textDecoder.decode(bytes.subarray(0, 4))
  if (magic !== REGISTRY_MAGIC) {
    throw new Error(`Invalid world registry header: ${magic}`)
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint32(4, true)
  if (version !== REGISTRY_VERSION) {
    throw new Error(`Unsupported world registry version ${version}.`)
  }

  const count = view.getUint32(8, true)
  const worlds: StoredWorldRecord[] = []
  let offset = 12

  for (let index = 0; index < count; index += 1) {
    const name = readString(bytes, offset)
    const directoryName = readString(bytes, name.nextOffset)
    const seed = view.getUint32(directoryName.nextOffset, true)
    const createdAt = view.getFloat64(directoryName.nextOffset + 4, true)
    const updatedAt = view.getFloat64(directoryName.nextOffset + 12, true)
    offset = directoryName.nextOffset + 20
    worlds.push({
      name: name.value,
      directoryName: directoryName.value,
      seed,
      createdAt,
      updatedAt,
    })
  }

  return worlds
}

const encodeChunk = (chunk: StoredChunkRecord): Uint8Array => {
  const skyLight = chunk.skyLight ?? new Uint8Array(chunk.blocks.length)
  const blockLight = chunk.blockLight ?? new Uint8Array(chunk.blocks.length)
  const bytes = new Uint8Array(32 + chunk.blocks.length + skyLight.length + blockLight.length)
  const view = new DataView(bytes.buffer)
  bytes.set(textEncoder.encode(CHUNK_MAGIC), 0)
  view.setUint32(4, CHUNK_VERSION, true)
  view.setInt32(8, chunk.coord.x, true)
  view.setInt32(12, chunk.coord.z, true)
  view.setUint32(16, chunk.revision >>> 0, true)
  view.setUint32(20, chunk.blocks.length, true)
  view.setUint32(24, skyLight.length, true)
  view.setUint32(28, blockLight.length, true)
  bytes.set(chunk.blocks, 32)
  bytes.set(skyLight, 32 + chunk.blocks.length)
  bytes.set(blockLight, 32 + chunk.blocks.length + skyLight.length)
  return bytes
}

const decodeChunk = (bytes: Uint8Array): StoredChunkRecord => {
  if (bytes.byteLength < 32) {
    throw new Error('Chunk file is truncated.')
  }

  const magic = textDecoder.decode(bytes.subarray(0, 4))
  if (magic !== CHUNK_MAGIC) {
    throw new Error(`Invalid chunk file header: ${magic}`)
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint32(4, true)
  if (version !== CHUNK_VERSION) {
    throw new Error(`Unsupported chunk file version ${version}.`)
  }

  const blocksLength = view.getUint32(20, true)
  const skyLightLength = view.getUint32(24, true)
  const blockLightLength = view.getUint32(28, true)
  const blocksOffset = 32
  const skyLightOffset = blocksOffset + blocksLength
  const blockLightOffset = skyLightOffset + skyLightLength
  return {
    coord: {
      x: view.getInt32(8, true),
      z: view.getInt32(12, true),
    },
    revision: view.getUint32(16, true),
    blocks: bytes.slice(blocksOffset, blocksOffset + blocksLength),
    skyLight: bytes.slice(skyLightOffset, skyLightOffset + skyLightLength),
    blockLight: bytes.slice(blockLightOffset, blockLightOffset + blockLightLength),
    hasLightData: true,
  }
}

const encodeWorldTime = (time: WorldTimeState): Uint8Array => {
  const normalized = normalizeWorldTimeState(time)
  const bytes = new Uint8Array(16)
  const view = new DataView(bytes.buffer)
  bytes.set(textEncoder.encode(WORLD_TIME_MAGIC), 0)
  view.setUint32(4, WORLD_TIME_VERSION, true)
  view.setUint32(8, normalized.dayCount >>> 0, true)
  view.setUint32(12, normalized.timeOfDayTicks >>> 0, true)
  return bytes
}

const decodeWorldTime = (bytes: Uint8Array): WorldTimeState => {
  if (bytes.byteLength < 16) {
    throw new Error('World time file is truncated.')
  }

  const magic = textDecoder.decode(bytes.subarray(0, 4))
  if (magic !== WORLD_TIME_MAGIC) {
    throw new Error(`Invalid world time file header: ${magic}`)
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint32(4, true)
  if (version !== WORLD_TIME_VERSION) {
    throw new Error(`Unsupported world time file version ${version}.`)
  }

  return normalizeWorldTimeState({
    dayCount: view.getUint32(8, true),
    timeOfDayTicks: view.getUint32(12, true),
  })
}

const encodePlayer = (record: StoredPlayerRecord): Uint8Array => {
  const inventory = normalizeInventorySnapshot(record.inventory)
  const playerCraftingInput = inventory.playerCraftingInput ?? []
  const entityIdBytes = textEncoder.encode(record.snapshot.entityId)
  const bytes = new Uint8Array(
    72 + inventory.slots.length * 8 + playerCraftingInput.length * 8 + 2 + entityIdBytes.length,
  )
  const view = new DataView(bytes.buffer)
  bytes.set(textEncoder.encode(PLAYER_MAGIC), 0)
  view.setUint32(4, PLAYER_VERSION, true)
  view.setFloat64(8, record.snapshot.state.position[0], true)
  view.setFloat64(16, record.snapshot.state.position[1], true)
  view.setFloat64(24, record.snapshot.state.position[2], true)
  view.setFloat64(32, record.snapshot.state.yaw, true)
  view.setFloat64(40, record.snapshot.state.pitch, true)
  view.setUint32(48, record.snapshot.gamemode, true)
  view.setUint32(52, inventory.selectedSlot >>> 0, true)
  view.setUint32(56, inventory.slots.length, true)
  view.setUint32(60, inventory.cursor?.itemId ?? 0, true)
  view.setUint32(64, inventory.cursor?.count ?? 0, true)
  view.setUint32(68, playerCraftingInput.length, true)

  let offset = 72
  for (const slot of inventory.slots) {
    view.setUint32(offset, slot.itemId >>> 0, true)
    view.setUint32(offset + 4, Math.max(0, Math.trunc(slot.count)) >>> 0, true)
    offset += 8
  }

  for (const slot of playerCraftingInput) {
    view.setUint32(offset, slot.itemId >>> 0, true)
    view.setUint32(offset + 4, Math.max(0, Math.trunc(slot.count)) >>> 0, true)
    offset += 8
  }

  writeString(bytes, offset, record.snapshot.entityId)

  return bytes
}

const decodePlayer = (bytes: Uint8Array, playerName: PlayerName): StoredPlayerRecord => {
  if (bytes.byteLength < 68) {
    throw new Error('Player file is truncated.')
  }

  const magic = textDecoder.decode(bytes.subarray(0, 4))
  if (magic !== PLAYER_MAGIC) {
    throw new Error(`Invalid player file header: ${magic}`)
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint32(4, true)
  if (version !== 6 && version !== PLAYER_VERSION) {
    throw new Error(`Unsupported player file version ${version}.`)
  }

  const gamemode: PlayerGamemode = view.getUint32(48, true) === 1 ? 1 : 0
  const selectedSlot = view.getUint32(52, true)
  const slotCount = view.getUint32(56, true)
  const cursorItemId = view.getUint32(60, true) as ItemId
  const cursorCount = view.getUint32(64, true)
  const slots: InventorySnapshot['slots'] = []
  const playerCraftingInput: InventorySnapshot['playerCraftingInput'] = []
  const playerCraftingSlotCount =
    version >= PLAYER_VERSION ? view.getUint32(68, true) : PLAYER_CRAFTING_INPUT_SLOT_COUNT
  let offset = version >= PLAYER_VERSION ? 72 : 68

  for (let index = 0; index < slotCount; index += 1) {
    slots.push({
      itemId: view.getUint32(offset, true) as ItemId,
      count: view.getUint32(offset + 4, true),
    })
    offset += 8
  }

  if (version >= PLAYER_VERSION) {
    for (let index = 0; index < playerCraftingSlotCount; index += 1) {
      playerCraftingInput.push({
        itemId: view.getUint32(offset, true) as ItemId,
        count: view.getUint32(offset + 4, true),
      })
      offset += 8
    }
  }

  const entityId = readString(bytes, offset).value

  const inventory = normalizeInventorySnapshot({
    slots,
    playerCraftingInput,
    selectedSlot,
    cursor:
      cursorCount > 0
        ? {
            itemId: cursorItemId,
            count: cursorCount,
          }
        : null,
  })

  return {
    snapshot: {
      entityId,
      name: playerName,
      active: false,
      gamemode,
      flying: false,
      state: {
        position: [view.getFloat64(8, true), view.getFloat64(16, true), view.getFloat64(24, true)],
        yaw: view.getFloat64(32, true),
        pitch: view.getFloat64(40, true),
      },
    },
    inventory,
  }
}

const encodeDroppedItems = (items: readonly DroppedItemSnapshot[]): Uint8Array => {
  const entityIds = items.map((item) => textEncoder.encode(item.entityId))
  const totalSize =
    12 + items.reduce((size, _item, index) => size + 66 + entityIds[index]!.length, 0)
  const bytes = new Uint8Array(totalSize)
  const view = new DataView(bytes.buffer)
  bytes.set(textEncoder.encode(DROPPED_ITEMS_MAGIC), 0)
  view.setUint32(4, DROPPED_ITEMS_VERSION, true)
  view.setUint32(8, items.length, true)

  let offset = 12
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!
    view.setFloat64(offset, item.position[0], true)
    view.setFloat64(offset + 8, item.position[1], true)
    view.setFloat64(offset + 16, item.position[2], true)
    view.setFloat64(offset + 24, item.velocity[0], true)
    view.setFloat64(offset + 32, item.velocity[1], true)
    view.setFloat64(offset + 40, item.velocity[2], true)
    view.setUint32(offset + 48, item.itemId >>> 0, true)
    view.setUint32(offset + 52, Math.max(0, Math.trunc(item.count)) >>> 0, true)
    offset += 56
    offset = writeString(bytes, offset, item.entityId)
    view.setFloat64(offset, Math.max(0, item.pickupCooldownMs), true)
    offset += 8
  }

  return bytes
}

const decodeDroppedItems = (bytes: Uint8Array): DroppedItemSnapshot[] => {
  if (bytes.byteLength < 12) {
    throw new Error('Dropped items file is truncated.')
  }

  const magic = textDecoder.decode(bytes.subarray(0, 4))
  if (magic !== DROPPED_ITEMS_MAGIC) {
    throw new Error(`Invalid dropped items file header: ${magic}`)
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint32(4, true)
  if (version !== DROPPED_ITEMS_VERSION) {
    throw new Error(`Unsupported dropped items file version ${version}.`)
  }

  const count = view.getUint32(8, true)
  const items: DroppedItemSnapshot[] = []
  let offset = 12

  for (let index = 0; index < count; index += 1) {
    const position: [number, number, number] = [
      view.getFloat64(offset, true),
      view.getFloat64(offset + 8, true),
      view.getFloat64(offset + 16, true),
    ]
    const velocity: [number, number, number] = [
      view.getFloat64(offset + 24, true),
      view.getFloat64(offset + 32, true),
      view.getFloat64(offset + 40, true),
    ]
    const itemId = view.getUint32(offset + 48, true) as ItemId
    const countValue = view.getUint32(offset + 52, true)
    offset += 56
    const entityId = readString(bytes, offset)
    offset = entityId.nextOffset
    const pickupCooldownMs = view.getFloat64(offset, true)
    offset += 8
    items.push({
      entityId: entityId.value,
      position,
      velocity,
      itemId,
      count: countValue,
      pickupCooldownMs,
    })
  }

  return items
}

const BLOCK_ENTITY_TYPE_TO_ID: Record<BlockEntityType, number> = {
  craftingTable: 1,
}

const BLOCK_ENTITY_ID_TO_TYPE = new Map<number, BlockEntityType>(
  Object.entries(BLOCK_ENTITY_TYPE_TO_ID).map(([type, id]) => [id, type as BlockEntityType]),
)

const encodeBlockEntities = (entities: readonly StoredBlockEntityRecord[]): Uint8Array => {
  const entityIds = entities.map((entity) => textEncoder.encode(entity.entityId))
  const totalSize =
    12 +
    entities.reduce(
      (size, entity, index) => size + 19 + entity.slots.length * 8 + entityIds[index]!.length,
      0,
    )
  const bytes = new Uint8Array(totalSize)
  const view = new DataView(bytes.buffer)
  bytes.set(textEncoder.encode(BLOCK_ENTITIES_MAGIC), 0)
  view.setUint32(4, BLOCK_ENTITIES_VERSION, true)
  view.setUint32(8, entities.length, true)

  let offset = 12
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index]!
    view.setInt32(offset, entity.x, true)
    view.setInt32(offset + 4, entity.y, true)
    view.setInt32(offset + 8, entity.z, true)
    view.setUint8(offset + 12, BLOCK_ENTITY_TYPE_TO_ID[entity.type] ?? 0)
    view.setUint32(offset + 13, entity.slots.length, true)
    offset += 17
    for (const slot of entity.slots) {
      view.setUint32(offset, slot.itemId >>> 0, true)
      view.setUint32(offset + 4, Math.max(0, Math.trunc(slot.count)) >>> 0, true)
      offset += 8
    }
    offset = writeString(bytes, offset, entity.entityId)
  }

  return bytes
}

const decodeBlockEntities = (bytes: Uint8Array): StoredBlockEntityRecord[] => {
  if (bytes.byteLength < 12) {
    throw new Error('Block entities file is truncated.')
  }

  const magic = textDecoder.decode(bytes.subarray(0, 4))
  if (magic !== BLOCK_ENTITIES_MAGIC) {
    throw new Error(`Invalid block entities file header: ${magic}`)
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint32(4, true)
  if (version !== 1 && version !== BLOCK_ENTITIES_VERSION) {
    throw new Error(`Unsupported block entities file version ${version}.`)
  }

  const count = view.getUint32(8, true)
  const entities: StoredBlockEntityRecord[] = []
  let offset = 12

  for (let index = 0; index < count; index += 1) {
    const x = view.getInt32(offset, true)
    const y = view.getInt32(offset + 4, true)
    const z = view.getInt32(offset + 8, true)
    const typeId = view.getUint8(offset + 12)
    const slotCount = version >= BLOCK_ENTITIES_VERSION ? view.getUint32(offset + 13, true) : 0
    offset += version >= BLOCK_ENTITIES_VERSION ? 17 : 13
    const type = BLOCK_ENTITY_ID_TO_TYPE.get(typeId)
    if (!type) {
      throw new Error(`Unknown block entity type id ${typeId}.`)
    }

    const slots =
      version >= BLOCK_ENTITIES_VERSION
        ? normalizeInventorySlotArray(
            Array.from({ length: slotCount }, (_, slotIndex) => ({
              itemId: view.getUint32(offset + slotIndex * 8, true) as ItemId,
              count: view.getUint32(offset + slotIndex * 8 + 4, true),
            })),
            slotCount,
          )
        : Array.from(
            { length: type === 'craftingTable' ? CRAFTING_TABLE_INPUT_SLOT_COUNT : 0 },
            () => createEmptyInventorySlot(),
          )

    if (version >= BLOCK_ENTITIES_VERSION) {
      offset += slotCount * 8
    }
    const entityId = readString(bytes, offset)
    offset = entityId.nextOffset

    entities.push({
      entityId: entityId.value,
      type,
      x,
      y,
      z,
      slots,
    })
  }

  return entities
}

const sanitizeDirectoryToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'world'

export class BinaryWorldStorage implements WorldStorage {
  private readonly registryPath: string
  private readonly worldsRoot: string
  private operationChain: Promise<void> = Promise.resolve()

  public constructor(private readonly rootDir: string) {
    this.registryPath = join(rootDir, 'registry.bin')
    this.worldsRoot = join(rootDir, 'worlds')
  }

  public async listWorlds(): Promise<WorldSummary[]> {
    return this.enqueue(async () => {
      const registry = await this.readRegistry()
      return registry
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(({ directoryName: _directoryName, ...world }) => world)
    })
  }

  public async getWorld(name: string): Promise<StoredWorldRecord | null> {
    return this.enqueue(async () => {
      const registry = await this.readRegistry()
      return registry.find((world) => world.name === name) ?? null
    })
  }

  public async createWorld(name: string, seed: number): Promise<StoredWorldRecord> {
    return this.enqueue(async () => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        throw new Error('World name is required.')
      }

      const registry = await this.readRegistry()
      if (registry.some((world) => world.name === trimmedName)) {
        throw new Error(`World "${trimmedName}" already exists.`)
      }

      const now = Date.now()
      const directoryName = `${sanitizeDirectoryToken(trimmedName)}-${now.toString(36)}`
      const record: StoredWorldRecord = {
        name: trimmedName,
        directoryName,
        seed: seed >>> 0,
        createdAt: now,
        updatedAt: now,
      }

      registry.push(record)
      await this.ensureDirectories(record.directoryName)
      await this.writeRegistry(registry)
      return record
    })
  }

  public async deleteWorld(name: string): Promise<boolean> {
    return this.enqueue(async () => {
      const registry = await this.readRegistry()
      const world = registry.find((candidate) => candidate.name === name)
      if (!world) {
        return false
      }

      await rm(this.worldDirectory(world.directoryName), { recursive: true, force: true })
      await this.writeRegistry(registry.filter((candidate) => candidate.name !== name))
      return true
    })
  }

  public async loadChunk(worldName: string, coord: ChunkCoord): Promise<StoredChunkRecord | null> {
    return this.enqueue(async () => {
      const world = await this.getWorldFromRegistry(worldName)
      if (!world) {
        return null
      }

      const path = this.chunkPath(world.directoryName, coord)

      try {
        const bytes = new Uint8Array(await readFile(path))
        return decodeChunk(bytes)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return null
        }
        throw error
      }
    })
  }

  public async saveChunk(worldName: string, chunk: StoredChunkRecord): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.requireWorld(worldName)
      await this.ensureDirectories(world.directoryName)
      await writeFile(this.chunkPath(world.directoryName, chunk.coord), encodeChunk(chunk))
    })
  }

  public async deleteChunk(worldName: string, coord: ChunkCoord): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.getWorldFromRegistry(worldName)
      if (!world) {
        return
      }
      await rm(this.chunkPath(world.directoryName, coord), { force: true })
    })
  }

  public async loadPlayer(
    worldName: string,
    playerName: PlayerName,
  ): Promise<StoredPlayerRecord | null> {
    return this.enqueue(async () => {
      const world = await this.getWorldFromRegistry(worldName)
      if (!world) {
        return null
      }

      try {
        const bytes = new Uint8Array(
          await readFile(this.playerPath(world.directoryName, playerName)),
        )
        return decodePlayer(bytes, playerName)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return null
        }
        throw error
      }
    })
  }

  public async savePlayer(worldName: string, player: StoredPlayerRecord): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.requireWorld(worldName)
      await this.ensureDirectories(world.directoryName)
      await writeFile(
        this.playerPath(world.directoryName, player.snapshot.name),
        encodePlayer(player),
      )
    })
  }

  public async loadDroppedItems(worldName: string): Promise<DroppedItemSnapshot[]> {
    return this.enqueue(async () => {
      const world = await this.getWorldFromRegistry(worldName)
      if (!world) {
        return []
      }

      try {
        const bytes = new Uint8Array(await readFile(this.droppedItemsPath(world.directoryName)))
        return decodeDroppedItems(bytes)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return []
        }
        throw error
      }
    })
  }

  public async saveDroppedItems(
    worldName: string,
    items: readonly DroppedItemSnapshot[],
  ): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.requireWorld(worldName)
      await this.ensureDirectories(world.directoryName)
      const path = this.droppedItemsPath(world.directoryName)

      if (items.length === 0) {
        await rm(path, { force: true })
        return
      }

      await writeFile(path, encodeDroppedItems(items))
    })
  }

  public async loadBlockEntities(worldName: string): Promise<StoredBlockEntityRecord[]> {
    return this.enqueue(async () => {
      const world = await this.getWorldFromRegistry(worldName)
      if (!world) {
        return []
      }

      try {
        const bytes = new Uint8Array(await readFile(this.blockEntitiesPath(world.directoryName)))
        return decodeBlockEntities(bytes)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return []
        }
        throw error
      }
    })
  }

  public async saveBlockEntities(
    worldName: string,
    entities: readonly StoredBlockEntityRecord[],
  ): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.requireWorld(worldName)
      await this.ensureDirectories(world.directoryName)
      const path = this.blockEntitiesPath(world.directoryName)

      if (entities.length === 0) {
        await rm(path, { force: true })
        return
      }

      await writeFile(path, encodeBlockEntities(entities))
    })
  }

  public async loadWorldTime(worldName: string): Promise<WorldTimeState | null> {
    return this.enqueue(async () => {
      const world = await this.getWorldFromRegistry(worldName)
      if (!world) {
        return null
      }

      try {
        const bytes = new Uint8Array(await readFile(this.worldTimePath(world.directoryName)))
        return decodeWorldTime(bytes)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return null
        }
        throw error
      }
    })
  }

  public async saveWorldTime(worldName: string, time: WorldTimeState): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.requireWorld(worldName)
      await this.ensureDirectories(world.directoryName)
      await writeFile(this.worldTimePath(world.directoryName), encodeWorldTime(time))
    })
  }

  public async touchWorld(worldName: string, updatedAt = Date.now()): Promise<StoredWorldRecord> {
    return this.enqueue(async () => {
      const registry = await this.readRegistry()
      const world = registry.find((candidate) => candidate.name === worldName)
      if (!world) {
        throw new Error(`Unknown world "${worldName}".`)
      }

      world.updatedAt = updatedAt
      await this.writeRegistry(registry)
      return world
    })
  }

  private async requireWorld(name: string): Promise<StoredWorldRecord> {
    const world = await this.getWorldFromRegistry(name)
    if (!world) {
      throw new Error(`Unknown world "${name}".`)
    }
    return world
  }

  private async getWorldFromRegistry(name: string): Promise<StoredWorldRecord | null> {
    const registry = await this.readRegistry()
    return registry.find((world) => world.name === name) ?? null
  }

  private async ensureDirectories(directoryName?: string): Promise<void> {
    await mkdir(this.worldsRoot, { recursive: true })
    if (directoryName) {
      await mkdir(this.worldDirectory(directoryName), { recursive: true })
      await mkdir(this.playerDirectory(directoryName), { recursive: true })
    }
  }

  private async readRegistry(): Promise<StoredWorldRecord[]> {
    await this.ensureDirectories()

    try {
      const bytes = new Uint8Array(await readFile(this.registryPath))
      return decodeRegistry(bytes)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  private async writeRegistry(worlds: readonly StoredWorldRecord[]): Promise<void> {
    await this.ensureDirectories()
    await writeFile(this.registryPath, encodeRegistry(worlds))
  }

  private worldDirectory(directoryName: string): string {
    return join(this.worldsRoot, directoryName)
  }

  private chunkPath(directoryName: string, coord: ChunkCoord): string {
    return join(this.worldDirectory(directoryName), chunkFilename(coord))
  }

  private playerDirectory(directoryName: string): string {
    return join(this.worldDirectory(directoryName), 'players')
  }

  private playerPath(directoryName: string, playerName: PlayerName): string {
    return join(this.playerDirectory(directoryName), playerFilename(playerName))
  }

  private droppedItemsPath(directoryName: string): string {
    return join(this.worldDirectory(directoryName), droppedItemsFilename())
  }

  private blockEntitiesPath(directoryName: string): string {
    return join(this.worldDirectory(directoryName), blockEntitiesFilename())
  }

  private worldTimePath(directoryName: string): string {
    return join(this.worldDirectory(directoryName), worldTimeFilename())
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationChain.then(operation, operation)
    this.operationChain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

export class DedicatedWorldStorage implements WorldStorage {
  private readonly worldRoot: string
  private readonly metadataPath: string
  private readonly playersRoot: string
  private operationChain: Promise<void> = Promise.resolve()
  private cachedWorld: StoredWorldRecord | null = null

  public constructor(private readonly rootDir: string) {
    this.worldRoot = join(rootDir, DEDICATED_WORLD_DIRECTORY_NAME)
    this.metadataPath = join(this.worldRoot, 'metadata.bin')
    this.playersRoot = join(this.worldRoot, 'players')
  }

  public async listWorlds(): Promise<WorldSummary[]> {
    return this.enqueue(async () => {
      const world = await this.readWorldRecord()
      if (!world) {
        return []
      }

      const { directoryName: _directoryName, ...summary } = world
      return [summary]
    })
  }

  public async getWorld(name: string): Promise<StoredWorldRecord | null> {
    return this.enqueue(async () => {
      const world = await this.readWorldRecord()
      if (!world || world.name !== name) {
        return null
      }

      return world
    })
  }

  public async createWorld(name: string, seed: number): Promise<StoredWorldRecord> {
    return this.enqueue(async () => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        throw new Error('World name is required.')
      }

      const existing = await this.readWorldRecord()
      if (existing) {
        throw new Error(`World "${existing.name}" already exists.`)
      }

      const now = Date.now()
      const world: StoredWorldRecord = {
        name: trimmedName,
        directoryName: DEDICATED_WORLD_DIRECTORY_NAME,
        seed: seed >>> 0,
        createdAt: now,
        updatedAt: now,
      }

      await this.ensureDirectories()
      await this.writeWorldMetadata(world)
      return world
    })
  }

  public async deleteWorld(name: string): Promise<boolean> {
    return this.enqueue(async () => {
      const world = await this.readWorldRecord()
      if (!world || world.name !== name) {
        return false
      }

      await rm(this.worldRoot, { recursive: true, force: true })
      this.cachedWorld = null
      return true
    })
  }

  public async loadChunk(worldName: string, coord: ChunkCoord): Promise<StoredChunkRecord | null> {
    return this.enqueue(async () => {
      const world = await this.getStoredWorld(worldName)
      if (!world) {
        return null
      }

      try {
        const bytes = new Uint8Array(await readFile(this.chunkPath(coord)))
        return decodeChunk(bytes)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return null
        }
        throw error
      }
    })
  }

  public async saveChunk(worldName: string, chunk: StoredChunkRecord): Promise<void> {
    return this.enqueue(async () => {
      await this.requireWorld(worldName)
      await this.ensureDirectories()
      await writeFile(this.chunkPath(chunk.coord), encodeChunk(chunk))
    })
  }

  public async deleteChunk(worldName: string, coord: ChunkCoord): Promise<void> {
    return this.enqueue(async () => {
      const world = await this.getStoredWorld(worldName)
      if (!world) {
        return
      }

      await rm(this.chunkPath(coord), { force: true })
    })
  }

  public async loadPlayer(
    worldName: string,
    playerName: PlayerName,
  ): Promise<StoredPlayerRecord | null> {
    return this.enqueue(async () => {
      const world = await this.getStoredWorld(worldName)
      if (!world) {
        return null
      }

      try {
        const bytes = new Uint8Array(await readFile(this.playerPath(playerName)))
        return decodePlayer(bytes, playerName)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return null
        }
        throw error
      }
    })
  }

  public async savePlayer(worldName: string, player: StoredPlayerRecord): Promise<void> {
    return this.enqueue(async () => {
      await this.requireWorld(worldName)
      await this.ensureDirectories()
      await writeFile(this.playerPath(player.snapshot.name), encodePlayer(player))
    })
  }

  public async loadDroppedItems(worldName: string): Promise<DroppedItemSnapshot[]> {
    return this.enqueue(async () => {
      const world = await this.getStoredWorld(worldName)
      if (!world) {
        return []
      }

      try {
        const bytes = new Uint8Array(await readFile(this.droppedItemsPath()))
        return decodeDroppedItems(bytes)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return []
        }
        throw error
      }
    })
  }

  public async saveDroppedItems(
    worldName: string,
    items: readonly DroppedItemSnapshot[],
  ): Promise<void> {
    return this.enqueue(async () => {
      await this.requireWorld(worldName)
      await this.ensureDirectories()
      const path = this.droppedItemsPath()

      if (items.length === 0) {
        await rm(path, { force: true })
        return
      }

      await writeFile(path, encodeDroppedItems(items))
    })
  }

  public async loadBlockEntities(worldName: string): Promise<StoredBlockEntityRecord[]> {
    return this.enqueue(async () => {
      const world = await this.getStoredWorld(worldName)
      if (!world) {
        return []
      }

      try {
        const bytes = new Uint8Array(await readFile(this.blockEntitiesPath()))
        return decodeBlockEntities(bytes)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return []
        }
        throw error
      }
    })
  }

  public async saveBlockEntities(
    worldName: string,
    entities: readonly StoredBlockEntityRecord[],
  ): Promise<void> {
    return this.enqueue(async () => {
      await this.requireWorld(worldName)
      await this.ensureDirectories()
      const path = this.blockEntitiesPath()

      if (entities.length === 0) {
        await rm(path, { force: true })
        return
      }

      await writeFile(path, encodeBlockEntities(entities))
    })
  }

  public async loadWorldTime(worldName: string): Promise<WorldTimeState | null> {
    return this.enqueue(async () => {
      const world = await this.getStoredWorld(worldName)
      if (!world) {
        return null
      }

      try {
        const bytes = new Uint8Array(await readFile(this.worldTimePath()))
        return decodeWorldTime(bytes)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return null
        }
        throw error
      }
    })
  }

  public async saveWorldTime(worldName: string, time: WorldTimeState): Promise<void> {
    return this.enqueue(async () => {
      await this.requireWorld(worldName)
      await this.ensureDirectories()
      await writeFile(this.worldTimePath(), encodeWorldTime(time))
    })
  }

  public async touchWorld(worldName: string, updatedAt = Date.now()): Promise<StoredWorldRecord> {
    return this.enqueue(async () => {
      const world = await this.requireWorld(worldName)
      const updatedWorld: StoredWorldRecord = {
        ...world,
        updatedAt,
      }
      await this.writeWorldMetadata(updatedWorld)
      return updatedWorld
    })
  }

  private async getStoredWorld(worldName: string): Promise<StoredWorldRecord | null> {
    const world = await this.readWorldRecord()
    if (!world || world.name !== worldName) {
      return null
    }

    return world
  }

  private async requireWorld(worldName: string): Promise<StoredWorldRecord> {
    const world = await this.getStoredWorld(worldName)
    if (!world) {
      throw new Error(`Unknown world "${worldName}".`)
    }

    return world
  }

  private async ensureDirectories(): Promise<void> {
    await mkdir(this.worldRoot, { recursive: true })
    await mkdir(this.playersRoot, { recursive: true })
  }

  private async readWorldRecord(): Promise<StoredWorldRecord | null> {
    const fromDisk = await this.readWorldMetadata()
    if (fromDisk) {
      this.cachedWorld = fromDisk
      return fromDisk
    }

    return this.cachedWorld
  }

  private async readWorldMetadata(): Promise<StoredWorldRecord | null> {
    try {
      const bytes = new Uint8Array(await readFile(this.metadataPath))
      const [world] = decodeRegistry(bytes)
      return world ?? null
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  private async writeWorldMetadata(world: StoredWorldRecord): Promise<void> {
    await this.ensureDirectories()
    const normalizedWorld: StoredWorldRecord = {
      ...world,
      directoryName: DEDICATED_WORLD_DIRECTORY_NAME,
    }
    this.cachedWorld = normalizedWorld
    await writeFile(this.metadataPath, encodeRegistry([normalizedWorld]))
  }

  private chunkPath(coord: ChunkCoord): string {
    return join(this.worldRoot, chunkFilename(coord))
  }

  private playerPath(playerName: PlayerName): string {
    return join(this.playersRoot, playerFilename(playerName))
  }

  private droppedItemsPath(): string {
    return join(this.worldRoot, droppedItemsFilename())
  }

  private blockEntitiesPath(): string {
    return join(this.worldRoot, blockEntitiesFilename())
  }

  private worldTimePath(): string {
    return join(this.worldRoot, worldTimeFilename())
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationChain.then(operation, operation)
    this.operationChain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
