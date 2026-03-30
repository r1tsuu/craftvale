import type { ItemId } from './world/generated/content-ids.ts'

export type { BlockId, ItemId } from './world/generated/content-ids.ts'

export interface ChunkCoord {
  x: number
  z: number
}

export interface LocalBlockCoord {
  x: number
  y: number
  z: number
}

export interface MeshData {
  vertexData: Float32Array
  indexData: Uint32Array
  indexCount: number
}

export interface TerrainMeshData {
  opaque: MeshData
  cutout: MeshData
  translucent: MeshData
}

export interface InventorySlot {
  itemId: ItemId
  count: number
}

export interface InventorySnapshot {
  slots: InventorySlot[]
  playerCraftingInput?: InventorySlot[]
  selectedSlot: number
  cursor: InventorySlot | null
}

export interface OpenCraftingTableContainerSnapshot {
  kind: 'craftingTable'
  blockEntityId: EntityId
  inputSlots: InventorySlot[]
}

export type OpenContainerSnapshot = OpenCraftingTableContainerSnapshot

export type BlockEntityType = 'craftingTable'
export type EntityId = string
export type PlayerName = string
export type PlayerGamemode = 0 | 1
export type LivingEntityType = 'player' | 'pig'

export interface LivingEntityState {
  position: [number, number, number]
  yaw: number
  pitch: number
}

export type PlayerState = LivingEntityState

export interface LivingEntitySnapshot {
  entityId: EntityId
  state: LivingEntityState
  active: boolean
}

export interface PlayerSnapshot extends LivingEntitySnapshot {
  name: PlayerName
  gamemode: PlayerGamemode
  flying: boolean
}

export type PigSnapshot = LivingEntitySnapshot

export interface DroppedItemSnapshot {
  entityId: EntityId
  position: [number, number, number]
  velocity: [number, number, number]
  itemId: ItemId
  count: number
  pickupCooldownMs: number
}

export interface ChatEntry {
  kind: 'player' | 'system'
  text: string
  senderName?: PlayerName
  receivedAt: number
}
