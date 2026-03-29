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
  selectedSlot: number
  cursor: InventorySlot | null
}

export type BlockEntityType = 'craftingTable'
export type EntityId = string
export type PlayerName = string
export type PlayerGamemode = 0 | 1

export interface PlayerState {
  position: [number, number, number]
  yaw: number
  pitch: number
}

export interface PlayerSnapshot {
  entityId: EntityId
  name: PlayerName
  state: PlayerState
  active: boolean
  gamemode: PlayerGamemode
  flying: boolean
}

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
