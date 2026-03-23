export interface WindowConfig {
  width: number;
  height: number;
  title: string;
}

export interface InputState {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  moveUp: boolean;
  moveDown: boolean;
  breakBlock: boolean;
  placeBlock: boolean;
  exit: boolean;
  mouseDeltaX: number;
  mouseDeltaY: number;
  cursorX: number;
  cursorY: number;
  typedText: string;
  backspacePressed: boolean;
  enterPressed: boolean;
  tabPressed: boolean;
  hotbarSelection: number | null;
  windowWidth: number;
  windowHeight: number;
  framebufferWidth: number;
  framebufferHeight: number;
  resized: boolean;
}

export type BlockId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

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
  blockId: BlockId;
  count: number;
}

export interface InventorySnapshot {
  slots: InventorySlot[];
  selectedSlot: number;
}

export type PlayerName = string;
export type PlayerGamemode = 0 | 1;

export interface PlayerState {
  position: [number, number, number];
  yaw: number;
  pitch: number;
}

export interface PlayerProfile {
  version: 1;
  playerName: PlayerName;
  createdAt: number;
  updatedAt: number;
}

export interface PlayerSnapshot {
  name: PlayerName;
  state: PlayerState;
  active: boolean;
  gamemode: PlayerGamemode;
  flying: boolean;
}

export interface ChatEntry {
  kind: "player" | "system";
  text: string;
  senderName?: PlayerName;
  receivedAt: number;
}
