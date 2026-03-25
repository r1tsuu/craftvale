import { expect, test } from "bun:test";
import { createDefaultClientSettings } from "../apps/client/src/client/client-settings.ts";
import { buildMainMenu } from "../apps/client/src/ui/menu.ts";

const createViewModel = (overrides: Partial<Parameters<typeof buildMainMenu>[2]> = {}) => ({
  activeScreen: "play" as const,
  worlds: [
    { name: "Alpha", seed: 123, createdAt: 0, updatedAt: 0 },
    { name: "Bravo", seed: 456, createdAt: 0, updatedAt: 0 },
  ],
  selectedWorldName: null,
  servers: [
    { id: "server-1", name: "Local Server", address: "127.0.0.1:3210", createdAt: 0, updatedAt: 0 },
  ],
  selectedServerId: null,
  createWorldName: "",
  createSeedText: "",
  addServerName: "",
  addServerAddress: "",
  focusedField: null,
  statusText: "READY",
  busy: false,
  settings: createDefaultClientSettings(),
  ...overrides,
});

const getButtonActions = (components: ReturnType<typeof buildMainMenu>): string[] =>
  components
    .filter((component) => component.kind === "button")
    .map((component) => component.action);

test("play screen centers on play and quit actions", () => {
  const components = buildMainMenu(1280, 720, createViewModel({ activeScreen: "play" }));
  const actions = getButtonActions(components);

  expect(actions).toContain("open-worlds");
  expect(actions).toContain("open-multiplayer");
  expect(actions).toContain("open-settings");
  expect(actions).toContain("quit-game");
  expect(actions).not.toContain("create-world");
  expect(actions).not.toContain("join-world");

  const quitButton = components.find((component) => component.id === "quit-button");
  const statusPanel = components.find((component) => component.id === "menu-status-panel");
  expect(quitButton?.kind).toBe("button");
  expect(statusPanel?.kind).toBe("panel");
  expect(statusPanel?.rect.y).toBeGreaterThan((quitButton?.rect.y ?? 0) + (quitButton?.rect.height ?? 0));
});

test("multiplayer screen exposes saved-server actions", () => {
  const actions = getButtonActions(
    buildMainMenu(
      1280,
      720,
      createViewModel({
        activeScreen: "multiplayer",
        selectedServerId: "server-1",
      }),
    ),
  );

  expect(actions).toContain("join-server");
  expect(actions).toContain("open-add-server");
  expect(actions).toContain("back-to-play");
  expect(actions).toContain("select-server:server-1");
  expect(actions).toContain("delete-server:server-1");
});

test("add server screen exposes name, address, save, and cancel actions", () => {
  const components = buildMainMenu(
    1280,
    720,
    createViewModel({
      activeScreen: "add-server",
      addServerName: "Local Server",
      focusedField: "server-name",
    }),
  );
  const actions = getButtonActions(components);

  expect(actions).toContain("focus-server-name");
  expect(actions).toContain("focus-server-address");
  expect(actions).toContain("save-server");
  expect(actions).toContain("back-to-multiplayer");

  const labels = components
    .filter((component) => component.kind === "button")
    .map((component) => component.text);
  expect(labels.some((text) => text.includes("NAME: Local Server_"))).toBe(true);
});

test("worlds screen exposes world selection and create world navigation", () => {
  const actions = getButtonActions(buildMainMenu(1280, 720, createViewModel({ activeScreen: "worlds" })));

  expect(actions).toContain("join-world");
  expect(actions).toContain("open-create-world");
  expect(actions).toContain("refresh-worlds");
  expect(actions).toContain("delete-world");
  expect(actions).toContain("back-to-play");
  expect(actions).toContain("select-world:Alpha");
});

test("worlds screen starts with no focused world copy when nothing is selected", () => {
  const components = buildMainMenu(1280, 720, createViewModel({ activeScreen: "worlds" }));
  const labels = components
    .filter((component) => component.kind === "label")
    .map((component) => component.text);

  expect(labels).toContain("FOCUSED WORLD");
  expect(labels).toContain("CLICK A WORLD");
  expect(labels).toContain("FOCUS ONE WITH A MOUSE CLICK");
});

test("create world screen exposes confirm and cancel actions", () => {
  const components = buildMainMenu(
    1280,
    720,
    createViewModel({
      activeScreen: "create-world",
      createWorldName: "New World",
      focusedField: "world-name",
    }),
  );
  const actions = getButtonActions(components);

  expect(actions).toContain("focus-world-name");
  expect(actions).toContain("focus-world-seed");
  expect(actions).toContain("create-world");
  expect(actions).toContain("back-to-worlds");
  expect(actions).not.toContain("open-worlds");

  const labels = components
    .filter((component) => component.kind === "button")
    .map((component) => component.text);
  expect(labels.some((text) => text.includes("NAME: New World_"))).toBe(true);
});

test("settings screen exposes sliders and lightweight graphics toggles", () => {
  const components = buildMainMenu(
    1280,
    720,
    createViewModel({
      activeScreen: "settings",
      settings: {
        ...createDefaultClientSettings(),
        fovDegrees: 80,
        mouseSensitivity: 125,
        renderDistance: 5,
        showDebugOverlay: false,
      },
    }),
  );

  const buttonActions = getButtonActions(components);
  const sliderActions = components
    .filter((component) => component.kind === "slider")
    .map((component) => component.action);
  const texts = components
    .filter((component) => component.kind === "label" || component.kind === "button")
    .map((component) => component.text);

  expect(sliderActions).toEqual(
    expect.arrayContaining([
      "set-setting:fovDegrees",
      "set-setting:mouseSensitivity",
      "set-setting:renderDistance",
    ]),
  );
  expect(buttonActions).toEqual(
    expect.arrayContaining([
      "toggle-setting:showDebugOverlay",
      "toggle-setting:showCrosshair",
      "reset-settings",
      "back-to-play",
    ]),
  );
  expect(texts).toContain("GAMEPLAY");
  expect(texts).toContain("GRAPHICS");
  expect(texts).toContain("80");
  expect(texts).toContain("125%");
  expect(texts).toContain("5 CHUNKS");
  expect(texts).toContain("DEBUG INFO: OFF");
});
