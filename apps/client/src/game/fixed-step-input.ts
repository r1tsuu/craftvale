import type { InputState } from '../types.ts'

export interface PendingFixedStepInputEdges {
  breakBlockPressed: boolean
  placeBlockPressed: boolean
  hotbarSelection: number | null
}

export const createPendingFixedStepInputEdges = (): PendingFixedStepInputEdges => ({
  breakBlockPressed: false,
  placeBlockPressed: false,
  hotbarSelection: null,
})

export const queueFixedStepInputEdges = (
  pending: PendingFixedStepInputEdges,
  input: Pick<InputState, 'breakBlockPressed' | 'placeBlockPressed' | 'hotbarSelection'>,
): PendingFixedStepInputEdges => ({
  breakBlockPressed: pending.breakBlockPressed || input.breakBlockPressed,
  placeBlockPressed: pending.placeBlockPressed || input.placeBlockPressed,
  hotbarSelection: input.hotbarSelection ?? pending.hotbarSelection,
})

export const applyFixedStepInputEdges = (
  input: InputState,
  pending: PendingFixedStepInputEdges,
): InputState => ({
  ...input,
  breakBlockPressed: pending.breakBlockPressed || input.breakBlockPressed,
  placeBlockPressed: pending.placeBlockPressed || input.placeBlockPressed,
  hotbarSelection: pending.hotbarSelection ?? input.hotbarSelection,
})
