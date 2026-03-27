import type { InputState } from '../types.ts'

export interface PendingFixedStepInputEdges {
  breakBlockPressed: boolean
  placeBlockPressed: boolean
  hotbarSelection: number | null
  hotbarScrollDelta: number
}

export const createPendingFixedStepInputEdges = (): PendingFixedStepInputEdges => ({
  breakBlockPressed: false,
  placeBlockPressed: false,
  hotbarSelection: null,
  hotbarScrollDelta: 0,
})

export const queueFixedStepInputEdges = (
  pending: PendingFixedStepInputEdges,
  input: Pick<
    InputState,
    'breakBlockPressed' | 'placeBlockPressed' | 'hotbarSelection' | 'hotbarScrollDelta'
  >,
): PendingFixedStepInputEdges => ({
  breakBlockPressed: pending.breakBlockPressed || input.breakBlockPressed,
  placeBlockPressed: pending.placeBlockPressed || input.placeBlockPressed,
  hotbarSelection: input.hotbarSelection ?? pending.hotbarSelection,
  hotbarScrollDelta: pending.hotbarScrollDelta + input.hotbarScrollDelta,
})

export const applyFixedStepInputEdges = (
  input: InputState,
  pending: PendingFixedStepInputEdges,
): InputState => ({
  ...input,
  breakBlockPressed: pending.breakBlockPressed || input.breakBlockPressed,
  placeBlockPressed: pending.placeBlockPressed || input.placeBlockPressed,
  hotbarSelection: pending.hotbarSelection ?? input.hotbarSelection,
  hotbarScrollDelta: pending.hotbarScrollDelta + input.hotbarScrollDelta,
})
