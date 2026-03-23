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
    chatDraft: "/gamemode 1",
    chatMessages: [
      {
        kind: "system",
        text: "Gamemode set to creative.",
        receivedAt: 1,
      },
      {
        kind: "player",
        senderName: "Alice",
        text: "hello",
        receivedAt: 2,
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
