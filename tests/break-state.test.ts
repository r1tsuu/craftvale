import { expect, test } from 'bun:test'

import {
  advanceBreakState,
  type BreakState,
  getBreakProgress,
} from '../apps/client/src/game/break-state.ts'

test('initialises fresh state when there is no current state', () => {
  const next = advanceBreakState(null, { x: 1, y: 2, z: 3 }, 50)
  expect(next).toEqual({ x: 1, y: 2, z: 3, elapsed: 50 })
})

test('accumulates elapsed time on the same target', () => {
  const s0 = advanceBreakState(null, { x: 1, y: 2, z: 3 }, 50)
  const s1 = advanceBreakState(s0, { x: 1, y: 2, z: 3 }, 50)
  expect(s1?.elapsed).toBe(100)
})

test('resets when target block changes', () => {
  const s0 = advanceBreakState(null, { x: 1, y: 2, z: 3 }, 200)
  const s1 = advanceBreakState(s0, { x: 5, y: 2, z: 3 }, 50)
  expect(s1).toEqual({ x: 5, y: 2, z: 3, elapsed: 50 })
})

test('returns null when target is null (mouse released)', () => {
  const s0 = advanceBreakState(null, { x: 1, y: 2, z: 3 }, 200)
  expect(advanceBreakState(s0, null, 50)).toBeNull()
})

test('getBreakProgress clamps to 1 when elapsed exceeds durability', () => {
  const state: BreakState = { x: 0, y: 0, z: 0, elapsed: 999 }
  expect(getBreakProgress(state, 500)).toBe(1)
})

test('getBreakProgress returns 1 immediately for zero durability', () => {
  const state: BreakState = { x: 0, y: 0, z: 0, elapsed: 0 }
  expect(getBreakProgress(state, 0)).toBe(1)
})

test('getBreakProgress returns partial progress mid-break', () => {
  const state: BreakState = { x: 0, y: 0, z: 0, elapsed: 300 }
  expect(getBreakProgress(state, 600)).toBeCloseTo(0.5)
})
