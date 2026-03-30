import type { WorldTimeState } from '../shared/lighting.ts'
import type { ChunkPayload } from '../shared/messages.ts'
import type {
  BlockId,
  ChatEntry,
  DroppedItemSnapshot,
  EntityId,
  InventorySnapshot,
  ItemId,
  OpenContainerSnapshot,
  PigSnapshot,
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
      kind: 'interactPlayerCraftingSlot'
      playerEntityId: EntityId
      slot: number
    }
  | {
      sequence: number
      kind: 'takePlayerCraftingResult'
      playerEntityId: EntityId
    }
  | {
      sequence: number
      kind: 'interactOpenContainerSlot'
      playerEntityId: EntityId
      slot: number
    }
  | {
      sequence: number
      kind: 'takeOpenContainerResult'
      playerEntityId: EntityId
    }
  | {
      sequence: number
      kind: 'closeOpenContainer'
      playerEntityId: EntityId
    }
  | {
      sequence: number
      kind: 'requestInventoryBrowserItem'
      playerEntityId: EntityId
      itemId: ItemId
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

export interface WorldContainerUpdate {
  playerEntityId: EntityId
  playerName: PlayerName
  container: OpenContainerSnapshot | null
}

export interface WorldChatMessage {
  targetPlayerEntityId: EntityId | null
  entry: ChatEntry
}

export interface WorldTickResult {
  changedChunks: ChunkPayload[]
  worldTime: WorldTimeState | null
  inventoryUpdates: WorldInventoryUpdate[]
  containerUpdates: WorldContainerUpdate[]
  playerUpdates: PlayerSnapshot[]
  pigUpdates: PigSnapshot[]
  chatMessages: WorldChatMessage[]
  spawnedDroppedItems: DroppedItemSnapshot[]
  updatedDroppedItems: DroppedItemSnapshot[]
  removedDroppedItemEntityIds: EntityId[]
}

export const createEmptyWorldTickResult = (): WorldTickResult => ({
  changedChunks: [],
  worldTime: null,
  inventoryUpdates: [],
  containerUpdates: [],
  playerUpdates: [],
  pigUpdates: [],
  chatMessages: [],
  spawnedDroppedItems: [],
  updatedDroppedItems: [],
  removedDroppedItemEntityIds: [],
})
