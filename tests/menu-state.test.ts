import { expect, test } from "bun:test";
import {
  applyMenuAction,
  applyMenuTyping,
  createMenuState,
  parseSeedInput,
  setMenuServers,
  setMenuWorlds,
  suggestWorldName,
} from "../apps/client/src/client/menu-state.ts";
import type { InputState } from "../apps/client/src/types.ts";

const createInput = (overrides: Partial<InputState> = {}): InputState => ({
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  moveUp: false,
  moveDown: false,
  breakBlock: false,
  placeBlock: false,
  exitPressed: false,
  mouseDeltaX: 0,
  mouseDeltaY: 0,
  cursorX: 0,
  cursorY: 0,
  typedText: "",
  slashPressed: false,
  backspacePressed: false,
  enterPressed: false,
  tabPressed: false,
  inventoryToggle: false,
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
  state = applyMenuTyping(state, createInput({ typedText: "Ignored" }));
  expect(state.createWorldName).toBe("");

  state = applyMenuAction(state, "open-create-world");
  expect(state.createWorldName).toBe("New World");
  state = applyMenuTyping(state, createInput({ typedText: "Alpha" }));
  expect(state.createWorldName).toBe("New WorldAlpha");

  state = applyMenuAction(state, "focus-world-seed");
  state = applyMenuTyping(state, createInput({ typedText: "12345" }));
  expect(state.createSeedText).toBe("12345");

  state = applyMenuTyping(state, createInput({ backspacePressed: true }));
  expect(state.createSeedText).toBe("1234");
});

test("menu typing updates saved server fields and tab cycles between them", () => {
  let state = createMenuState();
  state = applyMenuAction(state, "open-add-server");
  expect(state.activeScreen).toBe("add-server");
  expect(state.focusedField).toBe("server-name");

  state = applyMenuTyping(state, createInput({ typedText: "Local Server" }));
  expect(state.addServerName).toBe("Local Server");

  state = applyMenuTyping(state, createInput({ tabPressed: true }));
  expect(state.focusedField).toBe("server-address");

  state = applyMenuTyping(state, createInput({ typedText: "127.0.0.1:3210" }));
  expect(state.addServerAddress).toBe("127.0.0.1:3210");

  state = applyMenuTyping(state, createInput({ backspacePressed: true }));
  expect(state.addServerAddress).toBe("127.0.0.1:321");
});

test("menu actions drive screen navigation", () => {
  let state = createMenuState();
  expect(state.activeScreen).toBe("play");

  state = applyMenuAction(state, "open-settings");
  expect(state.activeScreen).toBe("settings");
  expect(state.focusedField).toBeNull();

  state = applyMenuAction(state, "back-to-play");
  expect(state.activeScreen).toBe("play");

  state = applyMenuAction(state, "open-worlds");
  expect(state.activeScreen).toBe("worlds");
  expect(state.focusedField).toBeNull();

  state = applyMenuAction(state, "open-create-world");
  expect(state.activeScreen).toBe("create-world");
  expect(state.focusedField).toBe("world-name");
  expect(state.createWorldName).toBe("New World");

  state = applyMenuAction(state, "back-to-worlds");
  expect(state.activeScreen).toBe("worlds");
  expect(state.focusedField).toBeNull();

  state = applyMenuAction(state, "back-to-play");
  expect(state.activeScreen).toBe("play");

  state = applyMenuAction(state, "open-multiplayer");
  expect(state.activeScreen).toBe("multiplayer");
  expect(state.focusedField).toBeNull();

  state = applyMenuAction(state, "open-add-server");
  expect(state.activeScreen).toBe("add-server");
  expect(state.focusedField).toBe("server-name");

  state = applyMenuAction(state, "back-to-multiplayer");
  expect(state.activeScreen).toBe("multiplayer");
  expect(state.focusedField).toBeNull();
});

test("menu world selection starts unfocused and only changes on explicit selection", () => {
  const state = setMenuWorlds(createMenuState(), [
    { name: "Bravo", seed: 2, createdAt: 0, updatedAt: 0 },
    { name: "Alpha", seed: 1, createdAt: 0, updatedAt: 0 },
  ]);

  expect(state.selectedWorldName).toBeNull();
  expect(applyMenuAction(state, "select-world:Alpha").selectedWorldName).toBe("Alpha");
});

test("menu world refresh preserves an existing focused world when possible", () => {
  const initialState = applyMenuAction(
    setMenuWorlds(createMenuState(), [
      { name: "Bravo", seed: 2, createdAt: 0, updatedAt: 0 },
      { name: "Alpha", seed: 1, createdAt: 0, updatedAt: 0 },
    ]),
    "select-world:Alpha",
  );

  const refreshedState = setMenuWorlds(initialState, [
    { name: "Alpha", seed: 1, createdAt: 0, updatedAt: 1 },
    { name: "Charlie", seed: 3, createdAt: 0, updatedAt: 1 },
  ]);

  expect(refreshedState.selectedWorldName).toBe("Alpha");
});

test("saved server refresh preserves an existing focused server when possible", () => {
  const initialState = applyMenuAction(
    setMenuServers(createMenuState(), [
      { id: "server-a", name: "Alpha", address: "127.0.0.1:3210", createdAt: 0, updatedAt: 0 },
      { id: "server-b", name: "Bravo", address: "10.0.0.2:3210", createdAt: 0, updatedAt: 0 },
    ]),
    "select-server:server-b",
  );

  const refreshedState = setMenuServers(initialState, [
    { id: "server-b", name: "Bravo", address: "10.0.0.2:3210", createdAt: 0, updatedAt: 1 },
    { id: "server-c", name: "Charlie", address: "10.0.0.3:3210", createdAt: 0, updatedAt: 1 },
  ]);

  expect(refreshedState.selectedServerId).toBe("server-b");
});

test("suggestWorldName follows Minecraft-style base naming and skips taken variants", () => {
  expect(suggestWorldName([])).toBe("New World");
  expect(
    suggestWorldName([
      { name: "New World", seed: 1, createdAt: 0, updatedAt: 0 },
      { name: "New World 2", seed: 2, createdAt: 0, updatedAt: 0 },
      { name: "Alpha", seed: 3, createdAt: 0, updatedAt: 0 },
    ]),
  ).toBe("New World 3");
});

test("blank seed input falls back to a deterministic numeric seed shape", () => {
  const seed = parseSeedInput("");
  expect(typeof seed).toBe("number");
  expect(seed).toBeGreaterThanOrEqual(0);
});
