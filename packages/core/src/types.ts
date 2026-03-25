export type BlockId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ItemId = 0 | 101 | 102 | 103 | 104 | 105 | 106 | 107 | 108 | 109;

export interface ChunkCoord {
  x: number;
  y: number;
  z: number;
}

export interface MeshData {
  vertexData: Float32Array;
  indexData: Uint32Array;
  indexCount: number;
}

export interface TerrainMeshData {
  opaque: MeshData;
  cutout: MeshData;
}

export interface InventorySlot {
  itemId: ItemId;
  count: number;
}

export type InventorySection = "hotbar" | "main";

export interface InventorySnapshot {
  hotbar: InventorySlot[];
  main: InventorySlot[];
  selectedSlot: number;
  cursor: InventorySlot | null;
}

export type EntityId = string;
export type PlayerName = string;
export type PlayerGamemode = 0 | 1;

export interface PlayerState {
  position: [number, number, number];
  yaw: number;
  pitch: number;
}

export interface PlayerSnapshot {
  entityId: EntityId;
  name: PlayerName;
  state: PlayerState;
  active: boolean;
  gamemode: PlayerGamemode;
  flying: boolean;
}

export interface DroppedItemSnapshot {
  entityId: EntityId;
  position: [number, number, number];
  velocity: [number, number, number];
  itemId: ItemId;
  count: number;
  pickupCooldownMs: number;
}

export interface ChatEntry {
  kind: "player" | "system";
  text: string;
  senderName?: PlayerName;
  receivedAt: number;
}
