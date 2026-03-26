import { expect, test } from "bun:test";
import { buildPlayHud } from "../apps/client/src/ui/hud.ts";
import {
  createDefaultInventory,
  getMainInventorySlotIndex,
  setSelectedInventorySlot,
} from "../packages/core/src/world/inventory.ts";
import { ITEM_IDS } from "../packages/core/src/world/items.ts";

test("play HUD includes a centered crosshair", () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createDefaultInventory(),
  });
  const panels = hud.filter((component) => component.kind === "panel");

  expect(panels).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "crosshair-horizontal",
        rect: { x: 640 - 7, y: 360 - 1, width: 14, height: 2 },
      }),
      expect.objectContaining({
        id: "crosshair-vertical",
        rect: { x: 640 - 1, y: 360 - 7, width: 2, height: 14 },
      }),
    ]),
  );
});

test("play HUD can hide the crosshair from settings", () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createDefaultInventory(),
    showCrosshair: false,
  });

  expect(hud.some((component) => component.id === "crosshair-horizontal")).toBe(
    false,
  );
  expect(hud.some((component) => component.id === "crosshair-vertical")).toBe(
    false,
  );
});

test("play HUD still renders the hotbar and selected slot label", () => {
  const inventory = setSelectedInventorySlot(createDefaultInventory(), 4);
  const hud = buildPlayHud(1280, 720, {
    inventory,
  });
  const labels = hud.filter((component) => component.kind === "label");

  expect(hud.some((component) => component.id === "hotbar-backdrop")).toBe(
    true,
  );
  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "hotbar-slot-0-icon",
        kind: "image",
      }),
    ]),
  );
  expect(labels).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "hotbar-selected-label",
        text: "5. LEAVES  x64",
      }),
      expect.objectContaining({
        id: "hotbar-slot-8-key",
        text: "9",
      }),
    ]),
  );
});

test("play HUD renders the current biome above the hotbar", () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createDefaultInventory(),
    biomeName: "FOREST",
  });
  const labels = hud.filter((component) => component.kind === "label");

  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "biome-badge-frame",
        rect: { x: 540, y: 548, width: 200, height: 30 },
      }),
    ]),
  );
  expect(labels).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "biome-badge-label",
        text: "BIOME: FOREST",
      }),
    ]),
  );
});

test("play HUD renders an authoritative world clock", () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createDefaultInventory(),
    worldTime: {
      dayCount: 2,
      timeOfDayTicks: 18_000,
    },
  });

  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "clock-badge-label",
        text: "DAY 3  06:00 PM",
      }),
    ]),
  );
});

test("play HUD renders chat and creative mode indicators", () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createDefaultInventory(),
    gamemode: 1,
    flying: true,
    chatOpen: true,
    chatNowMs: 10_000,
    chatDraft: "/gamemode 1",
    chatMessages: [
      {
        kind: "system",
        text: "Gamemode set to creative.",
        receivedAt: 1_000,
      },
      {
        kind: "player",
        senderName: "Alice",
        text: "hello",
        receivedAt: 2_000,
      },
    ],
  });

  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "mode-badge-label",
        text: "MODE: CREATIVE FLY",
      }),
      expect.objectContaining({
        id: "chat-input-label",
        text: "> /gamemode 1",
      }),
      expect.objectContaining({
        id: "chat-feed-line-bg-0",
        rect: { x: 14, y: 492, width: 460, height: 22 },
        color: [0.03, 0.04, 0.05, 0.68],
      }),
      expect.objectContaining({
        id: "chat-feed-line-0",
        text: "Gamemode set to creative.",
      }),
      expect.objectContaining({
        id: "chat-feed-line-1",
        text: "Alice: hello",
      }),
    ]),
  );
});

test("play HUD uses bottom-left passive chat layout with fading opacity", () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createDefaultInventory(),
    chatOpen: false,
    chatNowMs: 11_000,
    chatMessages: [
      {
        kind: "player",
        senderName: "Alice",
        text: "fresh",
        receivedAt: 10_500,
      },
      {
        kind: "system",
        text: "older",
        receivedAt: 500,
      },
    ],
  });

  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "chat-feed-line-bg-0",
        rect: { x: 14, y: 534, width: 460, height: 22 },
        color: [0.03, 0.04, 0.05, 0.4],
      }),
      expect.objectContaining({
        id: "chat-feed-line-bg-1",
        rect: { x: 14, y: 560, width: 460, height: 22 },
        color: [0.03, 0.04, 0.05, 0.2],
      }),
      expect.objectContaining({
        id: "chat-feed-line-0",
        text: "Alice: fresh",
      }),
      expect.objectContaining({
        id: "chat-feed-line-1",
        text: "older",
      }),
    ]),
  );
});

test("play HUD hides expired passive chat messages but keeps them while chat is open", () => {
  const closedHud = buildPlayHud(1280, 720, {
    inventory: createDefaultInventory(),
    chatOpen: false,
    chatNowMs: 20_000,
    chatMessages: [
      {
        kind: "system",
        text: "expired line",
        receivedAt: 1_000,
      },
    ],
  });

  const openHud = buildPlayHud(1280, 720, {
    inventory: createDefaultInventory(),
    chatOpen: true,
    chatNowMs: 20_000,
    chatDraft: "",
    chatMessages: [
      {
        kind: "system",
        text: "expired line",
        receivedAt: 1_000,
      },
    ],
  });

  expect(
    closedHud.some((component) => component.id === "chat-feed-line-0"),
  ).toBe(false);
  expect(openHud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "chat-feed-line-0",
        text: "expired line",
      }),
    ]),
  );
});

test("play HUD renders the full inventory overlay when inventory is open", () => {
  const inventory = createDefaultInventory();
  inventory.slots[getMainInventorySlotIndex(0)] = { itemId: ITEM_IDS.log, count: 12 };
  inventory.cursor = { itemId: ITEM_IDS.brick, count: 8 };
  const hud = buildPlayHud(1280, 720, {
    inventory,
    inventoryOpen: true,
    cursorX: 700,
    cursorY: 420,
  });

  expect(hud.some((component) => component.id === "crosshair-horizontal")).toBe(
    false,
  );
  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "inventory-backdrop",
        rect: { x: 319, y: 162, width: 642, height: 396 },
      }),
      expect.objectContaining({
        id: "inventory-title",
        text: "INVENTORY",
      }),
      expect.objectContaining({
        id: "inventory-main-slot-0-count",
        text: "12",
      }),
      expect.objectContaining({
        id: "inventory-main-slot-0-icon",
        kind: "image",
      }),
      expect.objectContaining({
        id: "inventory-hotbar-slot-0-key",
        text: "1",
      }),
      expect.objectContaining({
        id: "inventory-cursor-slot-count",
        text: "8",
      }),
    ]),
  );
});

test("play HUD renders a pause menu overlay over gameplay", () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createDefaultInventory(),
    pauseScreen: "menu",
  });

  expect(hud.some((component) => component.id === "hotbar-backdrop")).toBe(
    false,
  );
  expect(hud.some((component) => component.id === "crosshair-horizontal")).toBe(
    false,
  );
  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "pause-title",
        text: "GAME PAUSED",
      }),
      expect.objectContaining({
        id: "pause-resume-button",
        action: "pause-back-to-game",
      }),
      expect.objectContaining({
        id: "pause-settings-button",
        action: "pause-open-settings",
      }),
      expect.objectContaining({
        id: "pause-exit-button",
        action: "pause-exit-to-menu",
      }),
    ]),
  );

  const resumeButton = hud.find((component) => component.id === "pause-resume-button");
  const settingsButton = hud.find((component) => component.id === "pause-settings-button");
  const exitButton = hud.find((component) => component.id === "pause-exit-button");
  expect(settingsButton?.rect.y).toBe((resumeButton?.rect.y ?? 0) + (resumeButton?.rect.height ?? 0) + 18);
  expect(exitButton?.rect.y).toBe((settingsButton?.rect.y ?? 0) + (settingsButton?.rect.height ?? 0) + 18);
  expect(hud.some((component) => component.id === "pause-status-label")).toBe(false);
});

test("play HUD reuses the settings panel from pause context", () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createDefaultInventory(),
    pauseScreen: "settings",
    pauseSettings: {
      settings: {
        fovDegrees: 75,
        mouseSensitivity: 120,
        renderDistance: 4,
        showDebugOverlay: false,
        showCrosshair: true,
      },
      statusText: "PAUSED",
      busy: false,
    },
  });

  expect(hud.some((component) => component.id === "pause-settings-panel")).toBe(
    true,
  );
  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "pause-settings-title",
        text: "SETTINGS",
      }),
      expect.objectContaining({
        id: "pause-settings-fov-value",
        text: "75",
      }),
      expect.objectContaining({
        id: "pause-settings-crosshair-toggle",
        text: "CROSSHAIR: ON",
      }),
      expect.objectContaining({
        id: "pause-settings-back",
        action: "back-to-pause",
      }),
    ]),
  );
});
