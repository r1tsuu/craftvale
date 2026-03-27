import type { TextDrawCommand } from '../render/text.ts'

import { measureTextWidth } from '../render/text-mesh.ts'

export const DEBUG_INDICATOR_COLORS = {
  neutral: [0.98, 0.98, 0.98] as const,
  good: [0.49, 0.9, 0.59] as const,
  ok: [0.95, 0.82, 0.38] as const,
  bad: [0.93, 0.42, 0.35] as const,
  accent: [0.74, 0.9, 0.99] as const,
  subtle: [0.9, 0.92, 0.95] as const,
  muted: [0.67, 0.73, 0.81] as const,
  shadow: [0.05, 0.06, 0.08] as const,
}

const DEBUG_LINE_X = 20
const DEBUG_LINE_START_Y = 20
const DEBUG_LINE_SCALE = 3
const DEBUG_LINE_GAP = 33
const DEBUG_VALUE_GAP = 24
const DEBUG_INLINE_GAP = 24
const DEBUG_ROTATION_Y = DEBUG_LINE_START_Y + DEBUG_LINE_GAP * 7
const DEBUG_LIGHTING_Y = DEBUG_LINE_START_Y + DEBUG_LINE_GAP * 8
const DEBUG_STATUS_SCALE = 2
const DEBUG_STATUS_Y = DEBUG_LINE_START_Y + DEBUG_LINE_GAP * 9 + 8

interface DebugIndicatorThresholds {
  good: number
  ok: number
}

export interface DebugOverlayInput {
  fps: number
  tps: number | null
  tpsSourceLabel: string | null
  worldName: string | null
  memoryUsageText: string
  loadedChunkCount: number
  lastServerMessage: string
  position: readonly [number, number, number]
  yawDegrees: number
  pitchDegrees: number
  playerSkyLight: number
  playerBlockLight: number
  focusedBlockKey: string | null
  focusedSkyLight: number | null
  focusedBlockLight: number | null
  breakProgress: number
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

export const getDebugBreakProgressColor = (progress: number): readonly [number, number, number] => {
  if (progress >= 0.66) return DEBUG_INDICATOR_COLORS.bad
  if (progress >= 0.33) return DEBUG_INDICATOR_COLORS.ok
  return DEBUG_INDICATOR_COLORS.good
}

export const getDebugLightingColor = (
  skyLight: number,
  blockLight: number,
): readonly [number, number, number] =>
  getIndicatorColor(Math.max(skyLight, blockLight), {
    good: 12,
    ok: 6,
  })

const createDebugTextCommand = (
  text: string,
  x: number,
  y: number,
  scale: number,
  color: readonly [number, number, number, number?],
): TextDrawCommand => ({
  text,
  x,
  y,
  scale,
  color,
  shadowColor: DEBUG_INDICATOR_COLORS.shadow,
})

const buildMetricRow = (
  label: string,
  value: string,
  valueX: number,
  y: number,
  valueColor: readonly [number, number, number, number?],
): TextDrawCommand[] => [
  createDebugTextCommand(label, DEBUG_LINE_X, y, DEBUG_LINE_SCALE, DEBUG_INDICATOR_COLORS.muted),
  createDebugTextCommand(value, valueX, y, DEBUG_LINE_SCALE, valueColor),
]

export const buildDebugOverlayText = (input: DebugOverlayInput): TextDrawCommand[] => {
  const [x, y, z] = input.position
  const tpsLabel = input.tpsSourceLabel ? `TPS ${input.tpsSourceLabel}` : 'TPS'
  const labels = ['FPS', tpsLabel, 'POS', 'WORLD', 'MEM', 'CHUNKS', 'FOCUS BLOCK', 'ROT', 'LIGHT']
  const maxLabelWidth = Math.max(
    ...labels.map((label) => measureTextWidth(label, DEBUG_LINE_SCALE)),
  )
  const valueX = DEBUG_LINE_X + maxLabelWidth + DEBUG_VALUE_GAP
  const playerLightValue = `PLAYER S:${input.playerSkyLight} B:${input.playerBlockLight}`
  const commands: TextDrawCommand[] = [
    ...buildMetricRow(
      'FPS',
      input.fps.toFixed(1),
      valueX,
      DEBUG_LINE_START_Y,
      getDebugFpsColor(input.fps),
    ),
    ...buildMetricRow(
      tpsLabel,
      input.tps === null ? '--' : input.tps.toFixed(1),
      valueX,
      DEBUG_LINE_START_Y + DEBUG_LINE_GAP,
      getDebugTpsColor(input.tps),
    ),
    ...buildMetricRow(
      'POS',
      `X:${x.toFixed(2)} Y:${y.toFixed(2)} Z:${z.toFixed(2)}`,
      valueX,
      DEBUG_LINE_START_Y + DEBUG_LINE_GAP * 2,
      DEBUG_INDICATOR_COLORS.neutral,
    ),
    ...buildMetricRow(
      'WORLD',
      input.worldName ?? 'NONE',
      valueX,
      DEBUG_LINE_START_Y + DEBUG_LINE_GAP * 3,
      DEBUG_INDICATOR_COLORS.neutral,
    ),
    ...buildMetricRow(
      'MEM',
      input.memoryUsageText,
      valueX,
      DEBUG_LINE_START_Y + DEBUG_LINE_GAP * 4,
      DEBUG_INDICATOR_COLORS.accent,
    ),
    ...buildMetricRow(
      'CHUNKS',
      String(input.loadedChunkCount),
      valueX,
      DEBUG_LINE_START_Y + DEBUG_LINE_GAP * 5,
      DEBUG_INDICATOR_COLORS.neutral,
    ),
    ...buildMetricRow(
      'FOCUS BLOCK',
      input.focusedBlockKey ?? '--',
      valueX,
      DEBUG_LINE_START_Y + DEBUG_LINE_GAP * 6,
      input.focusedBlockKey ? DEBUG_INDICATOR_COLORS.accent : DEBUG_INDICATOR_COLORS.subtle,
    ),
    ...(input.breakProgress > 0 && input.focusedBlockKey !== null
      ? [
          createDebugTextCommand(
            `${Math.round(input.breakProgress * 100)}%`,
            valueX + measureTextWidth(input.focusedBlockKey, DEBUG_LINE_SCALE) + DEBUG_INLINE_GAP,
            DEBUG_LINE_START_Y + DEBUG_LINE_GAP * 6,
            DEBUG_LINE_SCALE,
            getDebugBreakProgressColor(input.breakProgress),
          ),
        ]
      : []),
    ...buildMetricRow(
      'ROT',
      `YAW:${input.yawDegrees.toFixed(1)} PITCH:${input.pitchDegrees.toFixed(1)}`,
      valueX,
      DEBUG_ROTATION_Y,
      DEBUG_INDICATOR_COLORS.neutral,
    ),
    ...buildMetricRow(
      'LIGHT',
      playerLightValue,
      valueX,
      DEBUG_LIGHTING_Y,
      getDebugLightingColor(input.playerSkyLight, input.playerBlockLight),
    ),
    createDebugTextCommand(
      input.lastServerMessage || 'SERVER CONNECTED',
      DEBUG_LINE_X,
      DEBUG_STATUS_Y,
      DEBUG_STATUS_SCALE,
      DEBUG_INDICATOR_COLORS.subtle,
    ),
  ]

  if (input.focusedSkyLight !== null && input.focusedBlockLight !== null) {
    const focusLabel = 'FOCUS'
    const focusLabelX =
      valueX + measureTextWidth(playerLightValue, DEBUG_LINE_SCALE) + DEBUG_INLINE_GAP
    const focusValueX =
      focusLabelX + measureTextWidth(focusLabel, DEBUG_LINE_SCALE) + DEBUG_INLINE_GAP
    commands.push(
      createDebugTextCommand(
        focusLabel,
        focusLabelX,
        DEBUG_LIGHTING_Y,
        DEBUG_LINE_SCALE,
        DEBUG_INDICATOR_COLORS.muted,
      ),
      createDebugTextCommand(
        `S:${input.focusedSkyLight} B:${input.focusedBlockLight}`,
        focusValueX,
        DEBUG_LIGHTING_Y,
        DEBUG_LINE_SCALE,
        getDebugLightingColor(input.focusedSkyLight, input.focusedBlockLight),
      ),
    )
  }

  return commands
}
