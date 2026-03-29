import type { WorldTimeState } from '../shared/lighting.ts'
import type { ChunkPayload } from '../shared/messages.ts'
import type {
  BlockId,
  ChatEntry,
  DroppedItemSnapshot,
  EntityId,
  InventorySnapshot,
  PlayerName,
  PlayerSnapshot,
  PlayerState,
} from '../types.ts'

export type QueuedGameplayIntent =
  | {
      sequence: number
      kind: 'mutateBlock'
      playerEntityId: EntityId
      x: number
      y: number
      z: number
      blockId: BlockId
    }
  | {
      sequence: number
      kind: 'selectInventorySlot'
      playerEntityId: EntityId
      slot: number
    }
  | {
      sequence: number
      kind: 'interactInventorySlot'
      playerEntityId: EntityId
      slot: number
    }
  | {
      sequence: number
      kind: 'useBlock'
      playerEntityId: EntityId
      x: number
      y: number
      z: number
    }
  | {
      sequence: number
      kind: 'updatePlayerState'
      playerEntityId: EntityId
      state: PlayerState
      flying: boolean
    }
  | {
      sequence: number
      kind: 'dropItem'
      playerEntityId: EntityId
      slot: number
      count: number
    }

export interface WorldInventoryUpdate {
  playerEntityId: EntityId
  playerName: PlayerName
  inventory: InventorySnapshot
}

export interface WorldChatMessage {
  targetPlayerEntityId: EntityId | null
  entry: ChatEntry
}

export interface WorldTickResult {
  changedChunks: ChunkPayload[]
  worldTime: WorldTimeState | null
  inventoryUpdates: WorldInventoryUpdate[]
  playerUpdates: PlayerSnapshot[]
  chatMessages: WorldChatMessage[]
  spawnedDroppedItems: DroppedItemSnapshot[]
  updatedDroppedItems: DroppedItemSnapshot[]
  removedDroppedItemEntityIds: EntityId[]
}

export const createEmptyWorldTickResult = (): WorldTickResult => ({
  changedChunks: [],
  worldTime: null,
  inventoryUpdates: [],
  playerUpdates: [],
  chatMessages: [],
  spawnedDroppedItems: [],
  updatedDroppedItems: [],
  removedDroppedItemEntityIds: [],
})
