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
  exitPressed: boolean;
  mouseDeltaX: number;
  mouseDeltaY: number;
  cursorX: number;
  cursorY: number;
  typedText: string;
  slashPressed: boolean;
  backspacePressed: boolean;
  enterPressed: boolean;
  tabPressed: boolean;
  inventoryToggle: boolean;
  hotbarSelection: number | null;
  windowWidth: number;
  windowHeight: number;
  framebufferWidth: number;
  framebufferHeight: number;
  resized: boolean;
}

export interface PlayerProfile {
  version: 1;
  playerName: string;
  createdAt: number;
  updatedAt: number;
}

export interface ClientSettings {
  fovDegrees: number;
  mouseSensitivity: number;
  renderDistance: number;
  showDebugOverlay: boolean;
  showCrosshair: boolean;
}

export interface SavedServerRecord {
  id: string;
  name: string;
  address: string;
  createdAt: number;
  updatedAt: number;
}
