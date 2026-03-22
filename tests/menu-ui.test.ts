import { expect, test } from "bun:test";
import { buildMainMenu } from "../src/ui/menu.ts";

const createViewModel = (overrides: Partial<Parameters<typeof buildMainMenu>[2]> = {}) => ({
  activeScreen: "play" as const,
  worlds: [
    { name: "Alpha", seed: 123, createdAt: 0, updatedAt: 0 },
    { name: "Bravo", seed: 456, createdAt: 0, updatedAt: 0 },
  ],
  selectedWorldName: null,
  createWorldName: "",
  createSeedText: "",
  focusedField: null,
  statusText: "READY",
  busy: false,
  ...overrides,
});

const getButtonActions = (components: ReturnType<typeof buildMainMenu>): string[] =>
  components
    .filter((component) => component.kind === "button")
    .map((component) => component.action);

test("play screen centers on play and quit actions", () => {
  const actions = getButtonActions(buildMainMenu(1280, 720, createViewModel({ activeScreen: "play" })));

  expect(actions).toContain("open-worlds");
  expect(actions).toContain("quit-game");
  expect(actions).not.toContain("create-world");
  expect(actions).not.toContain("join-world");
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
      focusedField: "world-name",
    }),
  );
  const actions = getButtonActions(components);

  expect(actions).toContain("focus-world-name");
  expect(actions).toContain("focus-world-seed");
  expect(actions).toContain("create-world");
  expect(actions).toContain("back-to-worlds");
  expect(actions).not.toContain("open-worlds");
});
