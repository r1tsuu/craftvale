import { expect, test } from 'bun:test'

import {
  buildDebugOverlayText,
  DEBUG_INDICATOR_COLORS,
  getDebugFpsColor,
  getDebugLightingColor,
  getDebugTpsColor,
} from '../apps/client/src/ui/debug-overlay.ts'

test('debug overlay includes TPS and colors healthy indicators as good', () => {
  const overlay = buildDebugOverlayText({
    fps: 60,
    tps: 20,
    tpsSourceLabel: 'WORKER',
    worldName: 'Alpha',
    lastServerMessage: '',
    position: [12.5, 70, -4.25],
    yawDegrees: 45,
    pitchDegrees: -10,
    playerSkyLight: 15,
    playerBlockLight: 0,
    focusedSkyLight: 15,
    focusedBlockLight: 8,
  })

  expect(overlay).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        text: 'FPS: 60.0',
        color: DEBUG_INDICATOR_COLORS.good,
      }),
      expect.objectContaining({
        text: 'TPS WORKER: 20.0',
        color: DEBUG_INDICATOR_COLORS.good,
      }),
      expect.objectContaining({
        text: 'LIGHT PLAYER S:15 B:0  FOCUS S:15 B:8',
        color: DEBUG_INDICATOR_COLORS.good,
      }),
    ]),
  )
})

test('debug overlay colors degraded indicators and shows missing TPS neutrally', () => {
  const overlay = buildDebugOverlayText({
    fps: 22,
    tps: null,
    tpsSourceLabel: 'WS',
    worldName: null,
    lastServerMessage: 'SERVER CONNECTED',
    position: [0, 65, 0],
    yawDegrees: 0,
    pitchDegrees: 0,
    playerSkyLight: 0,
    playerBlockLight: 2,
    focusedSkyLight: null,
    focusedBlockLight: null,
  })

  expect(overlay).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        text: 'FPS: 22.0',
        color: DEBUG_INDICATOR_COLORS.bad,
      }),
      expect.objectContaining({
        text: 'TPS WS: --',
        color: DEBUG_INDICATOR_COLORS.neutral,
      }),
      expect.objectContaining({
        text: 'LIGHT PLAYER S:0 B:2',
        color: DEBUG_INDICATOR_COLORS.bad,
      }),
    ]),
  )
})

test('debug indicator helpers classify good, ok, and bad thresholds consistently', () => {
  expect(getDebugFpsColor(58)).toEqual(DEBUG_INDICATOR_COLORS.good)
  expect(getDebugFpsColor(40)).toEqual(DEBUG_INDICATOR_COLORS.ok)
  expect(getDebugFpsColor(18)).toEqual(DEBUG_INDICATOR_COLORS.bad)

  expect(getDebugTpsColor(20)).toEqual(DEBUG_INDICATOR_COLORS.good)
  expect(getDebugTpsColor(16)).toEqual(DEBUG_INDICATOR_COLORS.ok)
  expect(getDebugTpsColor(12)).toEqual(DEBUG_INDICATOR_COLORS.bad)

  expect(getDebugLightingColor(14, 0)).toEqual(DEBUG_INDICATOR_COLORS.good)
  expect(getDebugLightingColor(0, 7)).toEqual(DEBUG_INDICATOR_COLORS.ok)
  expect(getDebugLightingColor(0, 3)).toEqual(DEBUG_INDICATOR_COLORS.bad)
})
