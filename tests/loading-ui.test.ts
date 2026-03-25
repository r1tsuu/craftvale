import { expect, test } from "bun:test";
import { buildLoadingScreen } from "../apps/client/src/ui/loading.ts";

test("loading screen shows target, status, and numeric progress when available", () => {
  const components = buildLoadingScreen(
    1280,
    720,
    {
      targetName: "Alpha",
      transportLabel: "LOCAL SINGLEPLAYER",
      statusText: "GENERATING STARTUP AREA...",
      progressPercent: 67,
    },
    1234,
  );

  const labels = components
    .filter((component) => component.kind === "label")
    .map((component) => component.text);

  expect(labels).toContain("LOCAL SINGLEPLAYER");
  expect(labels).toContain("ALPHA");
  expect(labels).toContain("GENERATING STARTUP AREA...");
  expect(labels).toContain("67%");
});

test("loading screen falls back to a generic startup-chunk message when percent is unavailable", () => {
  const components = buildLoadingScreen(
    1280,
    720,
    {
      targetName: "Local Server",
      transportLabel: "MULTIPLAYER SERVER",
      statusText: "WAITING FOR STARTUP CHUNKS...",
      progressPercent: null,
    },
    1234,
  );

  const labels = components
    .filter((component) => component.kind === "label")
    .map((component) => component.text);

  expect(labels).toContain("MULTIPLAYER SERVER");
  expect(labels).toContain("LOCAL SERVER");
  expect(labels).toContain("WAITING FOR STARTUP CHUNKS...");
  expect(labels).not.toContain("0%");
  expect(labels).toContain("WAITING FOR STARTUP CHUNKS");
});
