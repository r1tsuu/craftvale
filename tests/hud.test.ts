import { expect, test } from "bun:test";
import { buildPlayHud } from "../src/ui/hud.ts";
import { createDefaultInventory, setSelectedInventorySlot } from "../src/world/inventory.ts";

test("play HUD includes a centered crosshair", () => {
  const hud = buildPlayHud(1280, 720, createDefaultInventory());
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
  const hud = buildPlayHud(1280, 720, inventory);
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
