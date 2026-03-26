import type { InputState } from '../types.ts'

export interface PendingFixedStepInputEdges {
  breakBlockPressed: boolean
  placeBlockPressed: boolean
}

export const createPendingFixedStepInputEdges = (): PendingFixedStepInputEdges => ({
  breakBlockPressed: false,
  placeBlockPressed: false,
})

export const queueFixedStepInputEdges = (
  pending: PendingFixedStepInputEdges,
  input: Pick<InputState, 'breakBlockPressed' | 'placeBlockPressed'>,
): PendingFixedStepInputEdges => ({
  breakBlockPressed: pending.breakBlockPressed || input.breakBlockPressed,
  placeBlockPressed: pending.placeBlockPressed || input.placeBlockPressed,
})

export const applyFixedStepInputEdges = (
  input: InputState,
  pending: PendingFixedStepInputEdges,
): InputState => ({
  ...input,
  breakBlockPressed: pending.breakBlockPressed || input.breakBlockPressed,
  placeBlockPressed: pending.placeBlockPressed || input.placeBlockPressed,
})
