import { expect, test } from "bun:test";
import { buildPlayHud } from "../src/ui/hud.ts";
import { createDefaultInventory, setSelectedInventorySlot } from "../src/world/inventory.ts";

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

test("play HUD still renders the hotbar and selected slot label", () => {
  const inventory = setSelectedInventorySlot(createDefaultInventory(), 4);
  const hud = buildPlayHud(1280, 720, {
    inventory,
  });
  const labels = hud.filter((component) => component.kind === "label");

  expect(hud.some((component) => component.id === "hotbar-backdrop")).toBe(true);
  expect(labels).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "hotbar-selected-label",
        text: "5. LEAVES  x64",
      }),
      expect.objectContaining({
        id: "hotbar-slot-key-8",
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

  expect(closedHud.some((component) => component.id === "chat-feed-line-0")).toBe(false);
  expect(openHud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "chat-feed-line-0",
        text: "expired line",
      }),
    ]),
  );
});
