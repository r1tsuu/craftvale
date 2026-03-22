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
  windowWidth: number;
  windowHeight: number;
  framebufferWidth: number;
  framebufferHeight: number;
  resized: boolean;
}

export type BlockId = 0 | 1 | 2 | 3;

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

export interface PlayerState {
  position: [number, number, number];
  yaw: number;
  pitch: number;
}
