import { expect, test } from 'bun:test'

import { measureTextWidth } from '../apps/client/src/render/text-mesh.ts'
import {
  buildDebugOverlayText,
  DEBUG_INDICATOR_COLORS,
  getDebugBreakProgressColor,
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
    memoryUsageText: '12.3MB / 48.0MB (+1.4MB)',
    loadedChunkCount: 25,
    lastServerMessage: '',
    position: [12.5, 70, -4.25],
    yawDegrees: 45,
    pitchDegrees: -10,
    playerSkyLight: 15,
    playerBlockLight: 0,
    focusedBlockKey: 'glowstone',
    focusedSkyLight: 15,
    focusedBlockLight: 8,
    breakProgress: 0,
  })

  expect(overlay).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        text: 'FPS',
        color: DEBUG_INDICATOR_COLORS.muted,
      }),
      expect.objectContaining({
        text: '60.0',
        color: DEBUG_INDICATOR_COLORS.good,
      }),
      expect.objectContaining({
        text: 'TPS WORKER',
        color: DEBUG_INDICATOR_COLORS.muted,
      }),
      expect.objectContaining({
        text: '20.0',
        color: DEBUG_INDICATOR_COLORS.good,
      }),
      expect.objectContaining({
        text: 'MEM',
        color: DEBUG_INDICATOR_COLORS.muted,
      }),
      expect.objectContaining({
        text: '12.3MB / 48.0MB (+1.4MB)',
        color: DEBUG_INDICATOR_COLORS.accent,
      }),
      expect.objectContaining({
        text: 'CHUNKS',
        color: DEBUG_INDICATOR_COLORS.muted,
      }),
      expect.objectContaining({
        text: '25',
        color: DEBUG_INDICATOR_COLORS.neutral,
      }),
      expect.objectContaining({
        text: 'FOCUS BLOCK',
        color: DEBUG_INDICATOR_COLORS.muted,
      }),
      expect.objectContaining({
        text: 'glowstone',
        color: DEBUG_INDICATOR_COLORS.accent,
      }),
      expect.objectContaining({
        text: 'PLAYER S:15 B:0',
        color: DEBUG_INDICATOR_COLORS.good,
      }),
      expect.objectContaining({
        text: 'FOCUS',
        color: DEBUG_INDICATOR_COLORS.muted,
      }),
      expect.objectContaining({
        text: 'S:15 B:8',
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
    memoryUsageText: '8.0MB / 48.0MB (+0.7MB)',
    loadedChunkCount: 0,
    lastServerMessage: 'SERVER CONNECTED',
    position: [0, 65, 0],
    yawDegrees: 0,
    pitchDegrees: 0,
    playerSkyLight: 0,
    playerBlockLight: 2,
    focusedBlockKey: null,
    focusedSkyLight: null,
    focusedBlockLight: null,
    breakProgress: 0,
  })

  expect(overlay).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        text: '22.0',
        color: DEBUG_INDICATOR_COLORS.bad,
      }),
      expect.objectContaining({
        text: '--',
        color: DEBUG_INDICATOR_COLORS.neutral,
      }),
      expect.objectContaining({
        text: 'PLAYER S:0 B:2',
        color: DEBUG_INDICATOR_COLORS.bad,
      }),
      expect.objectContaining({
        text: '--',
        color: DEBUG_INDICATOR_COLORS.subtle,
      }),
    ]),
  )
})

test('break progress indicator colors good at low progress, ok mid, bad near complete', () => {
  expect(getDebugBreakProgressColor(0.1)).toEqual(DEBUG_INDICATOR_COLORS.good)
  expect(getDebugBreakProgressColor(0.5)).toEqual(DEBUG_INDICATOR_COLORS.ok)
  expect(getDebugBreakProgressColor(0.9)).toEqual(DEBUG_INDICATOR_COLORS.bad)
})

test('debug overlay shows break percentage inline when breaking a block', () => {
  const overlay = buildDebugOverlayText({
    fps: 60,
    tps: 20,
    tpsSourceLabel: 'WORKER',
    worldName: 'Alpha',
    memoryUsageText: '12.3MB / 48.0MB (+1.4MB)',
    loadedChunkCount: 25,
    lastServerMessage: '',
    position: [0, 70, 0],
    yawDegrees: 0,
    pitchDegrees: 0,
    playerSkyLight: 15,
    playerBlockLight: 0,
    focusedBlockKey: 'stone',
    focusedSkyLight: 0,
    focusedBlockLight: 0,
    breakProgress: 0.75,
  })

  expect(overlay).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ text: '75%', color: DEBUG_INDICATOR_COLORS.bad }),
    ]),
  )
})

test('debug overlay omits break percentage when not breaking', () => {
  const overlay = buildDebugOverlayText({
    fps: 60,
    tps: 20,
    tpsSourceLabel: 'WORKER',
    worldName: 'Alpha',
    memoryUsageText: '12.3MB / 48.0MB (+1.4MB)',
    loadedChunkCount: 25,
    lastServerMessage: '',
    position: [0, 70, 0],
    yawDegrees: 0,
    pitchDegrees: 0,
    playerSkyLight: 15,
    playerBlockLight: 0,
    focusedBlockKey: 'stone',
    focusedSkyLight: 0,
    focusedBlockLight: 0,
    breakProgress: 0,
  })

  expect(overlay.every((cmd) => !cmd.text.endsWith('%'))).toBe(true)
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

test('debug overlay keeps long labels and lighting segments from overlapping their values', () => {
  const overlay = buildDebugOverlayText({
    fps: 76.1,
    tps: 20,
    tpsSourceLabel: 'WORKER',
    worldName: 'New World',
    memoryUsageText: '80.5MB / 119.2MB (+10.3MB)',
    loadedChunkCount: 35,
    lastServerMessage: 'SERVER CONNECTED',
    position: [17.16, 69, 26.01],
    yawDegrees: 146.2,
    pitchDegrees: -45.3,
    playerSkyLight: 15,
    playerBlockLight: 0,
    focusedBlockKey: 'dirt',
    focusedSkyLight: 0,
    focusedBlockLight: 0,
    breakProgress: 0,
  })

  const tpsLabel = overlay.find((command) => command.text === 'TPS WORKER')
  const tpsValue = overlay.find((command) => command.text === '20.0')
  const focusBlockLabel = overlay.find((command) => command.text === 'FOCUS BLOCK')
  const focusBlockValue = overlay.find((command) => command.text === 'dirt')
  const playerLightValue = overlay.find((command) => command.text === 'PLAYER S:15 B:0')
  const focusLightLabel = overlay.find((command) => command.text === 'FOCUS')
  const focusLightValue = overlay.find((command) => command.text === 'S:0 B:0')

  expect(tpsLabel).toBeDefined()
  expect(tpsValue).toBeDefined()
  expect(focusBlockLabel).toBeDefined()
  expect(focusBlockValue).toBeDefined()
  expect(playerLightValue).toBeDefined()
  expect(focusLightLabel).toBeDefined()
  expect(focusLightValue).toBeDefined()

  expect(tpsValue!.x).toBeGreaterThan(
    tpsLabel!.x + measureTextWidth(tpsLabel!.text, tpsLabel!.scale),
  )
  expect(focusBlockValue!.x).toBeGreaterThan(
    focusBlockLabel!.x + measureTextWidth(focusBlockLabel!.text, focusBlockLabel!.scale),
  )
  expect(focusLightLabel!.x).toBeGreaterThan(
    playerLightValue!.x + measureTextWidth(playerLightValue!.text, playerLightValue!.scale),
  )
  expect(focusLightValue!.x).toBeGreaterThan(
    focusLightLabel!.x + measureTextWidth(focusLightLabel!.text, focusLightLabel!.scale),
  )
})
