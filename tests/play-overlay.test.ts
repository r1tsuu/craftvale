import { expect, test } from "bun:test";
import {
  resolvePlayEscapeAction,
  shouldLockCursor,
} from "../src/game/play-overlay.ts";

test("escape closes the most local play overlay first", () => {
  expect(
    resolvePlayEscapeAction({
      chatOpen: false,
      inventoryOpen: true,
      pauseScreen: "closed",
    }),
  ).toBe("close-inventory");

  expect(
    resolvePlayEscapeAction({
      chatOpen: true,
      inventoryOpen: false,
      pauseScreen: "closed",
    }),
  ).toBe("close-chat");

  expect(
    resolvePlayEscapeAction({
      chatOpen: false,
      inventoryOpen: false,
      pauseScreen: "settings",
    }),
  ).toBe("back-to-pause-menu");

  expect(
    resolvePlayEscapeAction({
      chatOpen: false,
      inventoryOpen: false,
      pauseScreen: "menu",
    }),
  ).toBe("resume-game");

  expect(
    resolvePlayEscapeAction({
      chatOpen: false,
      inventoryOpen: false,
      pauseScreen: "closed",
    }),
  ).toBe("open-pause-menu");
});

test("cursor lock only stays active during unpaused gameplay", () => {
  expect(
    shouldLockCursor("playing", {
      inventoryOpen: false,
      pauseScreen: "closed",
    }),
  ).toBe(true);

  expect(
    shouldLockCursor("playing", {
      inventoryOpen: true,
      pauseScreen: "closed",
    }),
  ).toBe(false);

  expect(
    shouldLockCursor("playing", {
      inventoryOpen: false,
      pauseScreen: "menu",
    }),
  ).toBe(false);

  expect(
    shouldLockCursor("menu", {
      inventoryOpen: false,
      pauseScreen: "closed",
    }),
  ).toBe(false);
});
