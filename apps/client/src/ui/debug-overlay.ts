import type { TextDrawCommand } from '../render/text.ts'

export const DEBUG_INDICATOR_COLORS = {
  neutral: [0.98, 0.98, 0.98] as const,
  good: [0.49, 0.9, 0.59] as const,
  ok: [0.95, 0.82, 0.38] as const,
  bad: [0.93, 0.42, 0.35] as const,
  subtle: [0.9, 0.92, 0.95] as const,
  shadow: [0.05, 0.06, 0.08] as const,
}

const DEBUG_LINE_X = 20
const DEBUG_LINE_SCALE = 3
const DEBUG_LINE_GAP = 33
const DEBUG_STATUS_SCALE = 2
const DEBUG_STATUS_Y = 152

interface DebugIndicatorThresholds {
  good: number
  ok: number
}

export interface DebugOverlayInput {
  fps: number
  tps: number | null
  tpsSourceLabel: string | null
  worldName: string | null
  lastServerMessage: string
  position: readonly [number, number, number]
  yawDegrees: number
  pitchDegrees: number
  playerSkyLight: number
  playerBlockLight: number
  focusedSkyLight: number | null
  focusedBlockLight: number | null
}

const getIndicatorColor = (
  value: number | null,
  thresholds: DebugIndicatorThresholds,
): readonly [number, number, number] => {
  if (value === null) {
    return DEBUG_INDICATOR_COLORS.neutral
  }

  if (value >= thresholds.good) {
    return DEBUG_INDICATOR_COLORS.good
  }

  if (value >= thresholds.ok) {
    return DEBUG_INDICATOR_COLORS.ok
  }

  return DEBUG_INDICATOR_COLORS.bad
}

export const getDebugFpsColor = (fps: number): readonly [number, number, number] =>
  getIndicatorColor(fps, {
    good: 55,
    ok: 30,
  })

export const getDebugTpsColor = (tps: number | null): readonly [number, number, number] =>
  getIndicatorColor(tps, {
    good: 19,
    ok: 15,
  })

export const getDebugLightingColor = (
  skyLight: number,
  blockLight: number,
): readonly [number, number, number] =>
  getIndicatorColor(Math.max(skyLight, blockLight), {
    good: 12,
    ok: 6,
  })

export const buildDebugOverlayText = (input: DebugOverlayInput): TextDrawCommand[] => {
  const [x, y, z] = input.position
  const focusedLightText =
    input.focusedSkyLight !== null && input.focusedBlockLight !== null
      ? `  FOCUS S:${input.focusedSkyLight} B:${input.focusedBlockLight}`
      : ''
  const tpsLabel = input.tpsSourceLabel ? `TPS ${input.tpsSourceLabel}` : 'TPS'

  return [
    {
      text: `FPS: ${input.fps.toFixed(1)}`,
      x: DEBUG_LINE_X,
      y: 20,
      scale: DEBUG_LINE_SCALE,
      color: getDebugFpsColor(input.fps),
      shadowColor: DEBUG_INDICATOR_COLORS.shadow,
    },
    {
      text: input.tps === null ? `${tpsLabel}: --` : `${tpsLabel}: ${input.tps.toFixed(1)}`,
      x: DEBUG_LINE_X,
      y: 20 + DEBUG_LINE_GAP,
      scale: DEBUG_LINE_SCALE,
      color: getDebugTpsColor(input.tps),
      shadowColor: DEBUG_INDICATOR_COLORS.shadow,
    },
    {
      text: `POS X:${x.toFixed(2)} Y:${y.toFixed(2)} Z:${z.toFixed(2)}`,
      x: DEBUG_LINE_X,
      y: 20 + DEBUG_LINE_GAP * 2,
      scale: DEBUG_LINE_SCALE,
      color: DEBUG_INDICATOR_COLORS.neutral,
      shadowColor: DEBUG_INDICATOR_COLORS.shadow,
    },
    {
      text: `WORLD: ${input.worldName ?? 'NONE'}`,
      x: DEBUG_LINE_X,
      y: 20 + DEBUG_LINE_GAP * 3,
      scale: DEBUG_LINE_SCALE,
      color: DEBUG_INDICATOR_COLORS.neutral,
      shadowColor: DEBUG_INDICATOR_COLORS.shadow,
    },
    {
      text: input.lastServerMessage || 'SERVER CONNECTED',
      x: DEBUG_LINE_X,
      y: DEBUG_STATUS_Y,
      scale: DEBUG_STATUS_SCALE,
      color: DEBUG_INDICATOR_COLORS.subtle,
      shadowColor: DEBUG_INDICATOR_COLORS.shadow,
    },
    {
      text: `ROT YAW:${input.yawDegrees.toFixed(1)} PITCH:${input.pitchDegrees.toFixed(1)}`,
      x: DEBUG_LINE_X,
      y: 180,
      scale: DEBUG_LINE_SCALE,
      color: DEBUG_INDICATOR_COLORS.neutral,
      shadowColor: DEBUG_INDICATOR_COLORS.shadow,
    },
    {
      text: `LIGHT PLAYER S:${input.playerSkyLight} B:${input.playerBlockLight}${focusedLightText}`,
      x: DEBUG_LINE_X,
      y: 213,
      scale: DEBUG_LINE_SCALE,
      color: getDebugLightingColor(input.playerSkyLight, input.playerBlockLight),
      shadowColor: DEBUG_INDICATOR_COLORS.shadow,
    },
  ]
}
