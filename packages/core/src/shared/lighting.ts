import { vec3, type Vec3 } from "../math/vec3.ts";

export const WORLD_TICKS_PER_DAY = 24_000;
export const LIGHT_LEVEL_MAX = 15;
export const DEFAULT_TIME_OF_DAY_TICKS = 6_000;

export type WorldTimePhase =
  | "sunrise"
  | "day"
  | "noon"
  | "sunset"
  | "night"
  | "midnight";

export interface WorldTimeState {
  dayCount: number;
  timeOfDayTicks: number;
}

export const TIMESET_PRESETS: Record<WorldTimePhase, number> = {
  sunrise: 0,
  day: 1_000,
  noon: 6_000,
  sunset: 12_000,
  night: 13_000,
  midnight: 18_000,
};

export const createDefaultWorldTimeState = (): WorldTimeState => ({
  dayCount: 0,
  timeOfDayTicks: DEFAULT_TIME_OF_DAY_TICKS,
});

export const cloneWorldTimeState = (time: WorldTimeState): WorldTimeState => ({
  dayCount: Math.max(0, Math.trunc(time.dayCount)),
  timeOfDayTicks: Math.max(0, Math.trunc(time.timeOfDayTicks)),
});

export const normalizeWorldTimeState = (time: WorldTimeState): WorldTimeState => {
  const absoluteTicks = Math.max(
    0,
    Math.trunc(time.dayCount) * WORLD_TICKS_PER_DAY + Math.trunc(time.timeOfDayTicks),
  );
  return {
    dayCount: Math.floor(absoluteTicks / WORLD_TICKS_PER_DAY),
    timeOfDayTicks: absoluteTicks % WORLD_TICKS_PER_DAY,
  };
};

export const advanceWorldTime = (
  time: WorldTimeState,
  deltaTicks: number,
): WorldTimeState => {
  const normalized = normalizeWorldTimeState(time);
  const absoluteTicks =
    normalized.dayCount * WORLD_TICKS_PER_DAY +
    normalized.timeOfDayTicks +
    Math.max(0, Math.trunc(deltaTicks));

  return {
    dayCount: Math.floor(absoluteTicks / WORLD_TICKS_PER_DAY),
    timeOfDayTicks: absoluteTicks % WORLD_TICKS_PER_DAY,
  };
};

export const setWorldTimeOfDay = (
  timeOfDayTicks: number,
  dayCount = 0,
): WorldTimeState => {
  const wrappedTicks =
    ((Math.trunc(timeOfDayTicks) % WORLD_TICKS_PER_DAY) + WORLD_TICKS_PER_DAY) %
    WORLD_TICKS_PER_DAY;
  return normalizeWorldTimeState({
    dayCount,
    timeOfDayTicks: wrappedTicks,
  });
};

export const resolveTimesetPreset = (value: string): number | null => {
  const normalized = value.trim().toLowerCase() as WorldTimePhase;
  return TIMESET_PRESETS[normalized] ?? null;
};

export const getWorldDayProgress = (time: WorldTimeState): number =>
  normalizeWorldTimeState(time).timeOfDayTicks / WORLD_TICKS_PER_DAY;

export const getWorldTimePhase = (time: WorldTimeState): WorldTimePhase => {
  const ticks = normalizeWorldTimeState(time).timeOfDayTicks;
  if (ticks < TIMESET_PRESETS.day) {
    return "sunrise";
  }
  if (ticks < TIMESET_PRESETS.noon) {
    return "day";
  }
  if (ticks < TIMESET_PRESETS.sunset) {
    return "noon";
  }
  if (ticks < TIMESET_PRESETS.night) {
    return "sunset";
  }
  if (ticks < TIMESET_PRESETS.midnight) {
    return "night";
  }
  return "midnight";
};

export const getWorldDaylightFactor = (time: WorldTimeState): number => {
  const sunHeight = Math.sin(getWorldDayProgress(time) * Math.PI * 2);
  const daylight = Math.max(0, Math.min(1, (sunHeight + 0.2) / 1.2));
  return 0.08 + daylight * 0.92;
};

export const getWorldSunDirection = (time: WorldTimeState): Vec3 => {
  const angle = getWorldDayProgress(time) * Math.PI * 2;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const z = Math.sin(angle * 0.5) * 0.35;
  const length = Math.hypot(x, y, z) || 1;
  return vec3(x / length, y / length, z / length);
};

export const formatWorldClock = (time: WorldTimeState): string => {
  const normalized = normalizeWorldTimeState(time);
  const totalMinutes = Math.floor((normalized.timeOfDayTicks / WORLD_TICKS_PER_DAY) * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `Day ${normalized.dayCount + 1}  ${displayHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")} ${period}`;
};
