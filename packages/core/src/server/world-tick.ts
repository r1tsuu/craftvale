import type { ChunkPayload } from "../shared/messages.ts";
import type { WorldTimeState } from "../shared/lighting.ts";
import type {
  BlockId,
  DroppedItemSnapshot,
  EntityId,
  InventorySnapshot,
  PlayerName,
  PlayerSnapshot,
  PlayerState,
} from "../types.ts";

export type QueuedGameplayIntent =
  | {
      sequence: number;
      kind: "mutateBlock";
      playerEntityId: EntityId;
      x: number;
      y: number;
      z: number;
      blockId: BlockId;
    }
  | {
      sequence: number;
      kind: "selectInventorySlot";
      playerEntityId: EntityId;
      slot: number;
    }
  | {
      sequence: number;
      kind: "interactInventorySlot";
      playerEntityId: EntityId;
      slot: number;
    }
  | {
      sequence: number;
      kind: "updatePlayerState";
      playerEntityId: EntityId;
      state: PlayerState;
      flying: boolean;
    };

export interface WorldInventoryUpdate {
  playerEntityId: EntityId;
  playerName: PlayerName;
  inventory: InventorySnapshot;
}

export interface WorldTickResult {
  changedChunks: ChunkPayload[];
  worldTime: WorldTimeState | null;
  inventoryUpdates: WorldInventoryUpdate[];
  playerUpdates: PlayerSnapshot[];
  spawnedDroppedItems: DroppedItemSnapshot[];
  updatedDroppedItems: DroppedItemSnapshot[];
  removedDroppedItemEntityIds: EntityId[];
}

export const createEmptyWorldTickResult = (): WorldTickResult => ({
  changedChunks: [],
  worldTime: null,
  inventoryUpdates: [],
  playerUpdates: [],
  spawnedDroppedItems: [],
  updatedDroppedItems: [],
  removedDroppedItemEntityIds: [],
});
