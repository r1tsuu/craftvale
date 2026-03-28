import type { InputState } from '../types.ts'

export interface PendingFixedStepInputEdges {
  breakBlockPressed: boolean
  placeBlockPressed: boolean
  hotbarSelection: number | null
  hotbarScrollDelta: number
  dropItemPressed: boolean
  dropItemHeld: boolean
}

export const createPendingFixedStepInputEdges = (): PendingFixedStepInputEdges => ({
  breakBlockPressed: false,
  placeBlockPressed: false,
  hotbarSelection: null,
  hotbarScrollDelta: 0,
  dropItemPressed: false,
  dropItemHeld: false,
})

export const queueFixedStepInputEdges = (
  pending: PendingFixedStepInputEdges,
  input: Pick<
    InputState,
    | 'breakBlockPressed'
    | 'placeBlockPressed'
    | 'hotbarSelection'
    | 'hotbarScrollDelta'
    | 'dropItemPressed'
    | 'dropItemHeld'
  >,
): PendingFixedStepInputEdges => ({
  breakBlockPressed: pending.breakBlockPressed || input.breakBlockPressed,
  placeBlockPressed: pending.placeBlockPressed || input.placeBlockPressed,
  hotbarSelection: input.hotbarSelection ?? pending.hotbarSelection,
  hotbarScrollDelta: pending.hotbarScrollDelta + input.hotbarScrollDelta,
  dropItemPressed: pending.dropItemPressed || input.dropItemPressed,
  dropItemHeld: pending.dropItemHeld || input.dropItemHeld,
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
  dropItemPressed: pending.dropItemPressed || input.dropItemPressed,
  dropItemHeld: pending.dropItemHeld || input.dropItemHeld,
})
