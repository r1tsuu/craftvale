import { expect, test } from 'bun:test'

import type { InputState } from '../apps/client/src/types.ts'

import {
  applyFixedStepInputEdges,
  createPendingFixedStepInputEdges,
  queueFixedStepInputEdges,
} from '../apps/client/src/game/fixed-step-input.ts'

const createInput = (overrides: Partial<InputState> = {}): InputState => ({
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  moveUp: false,
  moveDown: false,
  breakBlock: false,
  breakBlockPressed: false,
  placeBlock: false,
  placeBlockPressed: false,
  exitPressed: false,
  mouseDeltaX: 0,
  mouseDeltaY: 0,
  cursorX: 0,
  cursorY: 0,
  typedText: '',
  slashPressed: false,
  backspacePressed: false,
  enterPressed: false,
  tabPressed: false,
  inventoryToggle: false,
  hotbarSelection: null,
  windowWidth: 800,
  windowHeight: 600,
  framebufferWidth: 800,
  framebufferHeight: 600,
  resized: false,
  ...overrides,
})

test('fixed-step input edges survive until the next simulation step', () => {
  const queued = queueFixedStepInputEdges(
    createPendingFixedStepInputEdges(),
    createInput({ breakBlockPressed: true }),
  )
  const nextFrameInput = createInput()
  const stepInput = applyFixedStepInputEdges(nextFrameInput, queued)

  expect(queued.breakBlockPressed).toBe(true)
  expect(stepInput.breakBlockPressed).toBe(true)
})

test('fixed-step input edges accumulate either mouse button independently', () => {
  const queued = queueFixedStepInputEdges(
    queueFixedStepInputEdges(
      createPendingFixedStepInputEdges(),
      createInput({ breakBlockPressed: true }),
    ),
    createInput({ placeBlockPressed: true }),
  )

  expect(queued).toEqual({
    breakBlockPressed: true,
    placeBlockPressed: true,
    hotbarSelection: null,
  })
})

test('hotbar selection survives until the next simulation step', () => {
  const queued = queueFixedStepInputEdges(
    createPendingFixedStepInputEdges(),
    createInput({ hotbarSelection: 2 }),
  )
  const nextFrameInput = createInput()
  const stepInput = applyFixedStepInputEdges(nextFrameInput, queued)

  expect(queued.hotbarSelection).toBe(2)
  expect(stepInput.hotbarSelection).toBe(2)
})

test('latest queued hotbar selection wins before the next simulation step', () => {
  const queued = queueFixedStepInputEdges(
    queueFixedStepInputEdges(
      createPendingFixedStepInputEdges(),
      createInput({ hotbarSelection: 1 }),
    ),
    createInput({ hotbarSelection: 4 }),
  )

  expect(queued.hotbarSelection).toBe(4)
})
