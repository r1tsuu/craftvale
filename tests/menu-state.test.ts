import { expect, test } from "bun:test";
import {
  applyMenuAction,
  applyMenuTyping,
  createMenuState,
  parseSeedInput,
  setMenuWorlds,
} from "../src/client/menu-state.ts";
import type { InputState } from "../src/types.ts";

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

test("menu typing updates world name and seed fields", () => {
  let state = createMenuState();
  state = applyMenuTyping(state, createInput({ typedText: "Alpha" }));
  expect(state.createWorldName).toBe("Alpha");

  state = applyMenuAction(state, "focus-world-seed");
  state = applyMenuTyping(state, createInput({ typedText: "12345" }));
  expect(state.createSeedText).toBe("12345");

  state = applyMenuTyping(state, createInput({ backspacePressed: true }));
  expect(state.createSeedText).toBe("1234");
});

test("menu world selection follows available worlds", () => {
  const state = setMenuWorlds(createMenuState(), [
    { name: "Bravo", seed: 2, createdAt: 0, updatedAt: 0 },
    { name: "Alpha", seed: 1, createdAt: 0, updatedAt: 0 },
  ]);

  expect(state.selectedWorldName).toBe("Bravo");
  expect(applyMenuAction(state, "select-world:Alpha").selectedWorldName).toBe("Alpha");
});

test("blank seed input falls back to a deterministic numeric seed shape", () => {
  const seed = parseSeedInput("");
  expect(typeof seed).toBe("number");
  expect(seed).toBeGreaterThanOrEqual(0);
});
