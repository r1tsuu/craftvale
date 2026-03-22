import { expect, test } from "bun:test";
import { PlayerController } from "../src/game/player.ts";
import type { InputState } from "../src/types.ts";
import { VoxelWorld } from "../src/world/world.ts";

const createInput = (overrides: Partial<InputState> = {}): InputState => ({
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  moveUp: false,
  moveDown: false,
  breakBlock: false,
  placeBlock: false,
  exit: false,
  mouseDeltaX: 0,
  mouseDeltaY: 0,
  cursorX: 0,
  cursorY: 0,
  typedText: "",
  backspacePressed: false,
  enterPressed: false,
  tabPressed: false,
  hotbarSelection: null,
  windowWidth: 800,
  windowHeight: 600,
  framebufferWidth: 800,
  framebufferHeight: 600,
  resized: false,
  ...overrides,
});

const createEmptyWorld = (): VoxelWorld => {
  const world = new VoxelWorld();
  const chunk = world.ensureChunk({ x: 0, y: 0, z: 0 });
  chunk.blocks.fill(0);
  chunk.dirty = true;
  return world;
};

const addFloor = (world: VoxelWorld): void => {
  for (let z = 0; z < 8; z += 1) {
    for (let x = 0; x < 8; x += 1) {
      world.setBlock(x, 0, z, 3);
    }
  }
};

test("gravity pulls the player onto the ground", () => {
  const world = createEmptyWorld();
  addFloor(world);
  const player = new PlayerController();
  player.state.position = [2.5, 4, 2.5];

  for (let step = 0; step < 120; step += 1) {
    player.update(createInput(), 1 / 60, world);
  }

  expect(player.state.position[1]).toBeCloseTo(1, 3);
});

test("jump raises the player before gravity brings them down", () => {
  const world = createEmptyWorld();
  addFloor(world);
  const player = new PlayerController();
  player.state.position = [2.5, 1, 2.5];

  player.update(createInput({ moveUp: true }), 1 / 60, world);
  const jumpedHeight = player.state.position[1];

  for (let step = 0; step < 120; step += 1) {
    player.update(createInput(), 1 / 60, world);
  }

  expect(jumpedHeight).toBeGreaterThan(1);
  expect(player.state.position[1]).toBeCloseTo(1, 3);
});

test("horizontal movement collides with solid blocks", () => {
  const world = createEmptyWorld();
  addFloor(world);
  for (let y = 1; y <= 2; y += 1) {
    for (let z = 1; z <= 3; z += 1) {
      world.setBlock(3, y, z, 3);
    }
  }

  const player = new PlayerController();
  player.state.position = [1.5, 1, 2.5];

  for (let step = 0; step < 60; step += 1) {
    player.update(createInput({ moveRight: true }), 1 / 60, world);
  }

  expect(player.state.position[0]).toBeLessThan(2.7);
});
