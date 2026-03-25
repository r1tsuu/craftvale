import { expect, test } from "bun:test";
import {
  resolvePlayChatOpenDraft,
  resolvePlayChatTypedText,
  resolvePlayEscapeAction,
  shouldLockCursor,
} from "../apps/client/src/game/play-overlay.ts";

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

test("slash opens chat prefilled even when no slash character arrives in typed text", () => {
  expect(
    resolvePlayChatOpenDraft({
      enterPressed: false,
      slashPressed: true,
      typedText: "",
    }),
  ).toBe("/");

  expect(
    resolvePlayChatOpenDraft({
      enterPressed: false,
      slashPressed: true,
      typedText: "/gamemode 1",
    }),
  ).toBe("/gamemode 1");

  expect(
    resolvePlayChatOpenDraft({
      enterPressed: true,
      slashPressed: true,
      typedText: "",
    }),
  ).toBe("");
});

test("slash can still be typed manually after chat is already open", () => {
  expect(
    resolvePlayChatTypedText({
      slashPressed: true,
      typedText: "",
    }),
  ).toBe("/");

  expect(
    resolvePlayChatTypedText({
      slashPressed: true,
      typedText: "gamemode 1",
    }),
  ).toBe("/gamemode 1");

  expect(
    resolvePlayChatTypedText({
      slashPressed: false,
      typedText: "hello",
    }),
  ).toBe("hello");
});

test("chat preserves printable ASCII that was typed directly", () => {
  const printableAscii = Array.from(
    { length: 95 },
    (_, index) => String.fromCharCode(32 + index),
  ).join("");

  expect(
    resolvePlayChatTypedText({
      slashPressed: false,
      typedText: printableAscii,
    }),
  ).toBe(printableAscii);
});
