export interface BreakState {
  x: number
  y: number
  z: number
  elapsed: number
}

export const advanceBreakState = (
  current: BreakState | null,
  target: { x: number; y: number; z: number } | null,
  deltaMs: number,
): BreakState | null => {
  if (target === null) return null
  if (
    current === null ||
    current.x !== target.x ||
    current.y !== target.y ||
    current.z !== target.z
  ) {
    return { x: target.x, y: target.y, z: target.z, elapsed: deltaMs }
  }
  return { ...current, elapsed: current.elapsed + deltaMs }
}

export const getBreakProgress = (state: BreakState, durability: number): number =>
  durability === 0 ? 1 : Math.min(state.elapsed / durability, 1)
