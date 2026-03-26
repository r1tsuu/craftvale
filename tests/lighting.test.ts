import { expect, test } from "bun:test";
import {
  advanceWorldTime,
  formatWorldClock,
  getWorldDaylightFactor,
  resolveTimesetPreset,
  setWorldTimeOfDay,
} from "../packages/core/src/shared/lighting.ts";

test("world time advances across day boundaries", () => {
  const advanced = advanceWorldTime(
    {
      dayCount: 0,
      timeOfDayTicks: 23_999,
    },
    2,
  );

  expect(advanced).toEqual({
    dayCount: 1,
    timeOfDayTicks: 1,
  });
});

test("timeset presets resolve to canonical tick values", () => {
  expect(resolveTimesetPreset("sunrise")).toBe(0);
  expect(resolveTimesetPreset("day")).toBe(1_000);
  expect(resolveTimesetPreset("noon")).toBe(6_000);
  expect(resolveTimesetPreset("sunset")).toBe(12_000);
  expect(resolveTimesetPreset("night")).toBe(13_000);
  expect(resolveTimesetPreset("midnight")).toBe(18_000);
  expect(resolveTimesetPreset("unknown")).toBeNull();
});

test("daylight factor is brighter at noon than midnight", () => {
  const noon = getWorldDaylightFactor(setWorldTimeOfDay(6_000));
  const midnight = getWorldDaylightFactor(setWorldTimeOfDay(18_000));

  expect(noon).toBeGreaterThan(midnight);
  expect(noon).toBeGreaterThan(0.9);
  expect(midnight).toBeLessThan(0.2);
});

test("world clock formatting uses a one-based day label and AM/PM", () => {
  expect(
    formatWorldClock({
      dayCount: 2,
      timeOfDayTicks: 6_000,
    }),
  ).toBe("Day 3  06:00 AM");
});
