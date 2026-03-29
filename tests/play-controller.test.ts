import { expect, test } from 'bun:test'

import type { InputState } from '../apps/client/src/types.ts'
import type { ClientToServerMessage } from '../packages/core/src/shared/messages.ts'
import type { PlayerSnapshot } from '../packages/core/src/types.ts'

import { createDefaultClientSettings } from '../apps/client/src/app/client-settings.ts'
import { PlayController } from '../apps/client/src/app/play-controller.ts'
import { ClientWorldRuntime } from '../apps/client/src/app/world-runtime.ts'
import { CREATIVE_BREAK_DURATION_MS } from '../apps/client/src/game/break-state.ts'
import { createPendingFixedStepInputEdges } from '../apps/client/src/game/fixed-step-input.ts'
import { PlayerController } from '../apps/client/src/game/player.ts'
import { BLOCK_IDS, createEmptyInventory, ITEM_IDS } from '../packages/core/src/shared/index.ts'

const FIXED_TIMESTEP = 1 / 60

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
  hotbarScrollDelta: 0,
  dropItemPressed: false,
  dropItemHeld: false,
  windowWidth: 800,
  windowHeight: 600,
  framebufferWidth: 800,
  framebufferHeight: 600,
  resized: false,
  ...overrides,
})

const createCreativePlayerSnapshot = (): PlayerSnapshot => ({
  entityId: 'player:1',
  name: 'Alice',
  active: true,
  gamemode: 1,
  flying: true,
  state: {
    position: [0.5, 0.88, 2.5],
    yaw: 0,
    pitch: 0,
  },
})

const createHarness = (): {
  controller: PlayController
  sentMessages: ClientToServerMessage[]
  worldRuntime: ClientWorldRuntime
} => {
  const sentMessages: ClientToServerMessage[] = []
  const adapter = {
    eventBus: {
      send(message: ClientToServerMessage): Promise<unknown> {
        sentMessages.push(message)
        return Promise.resolve({})
      },
    },
    close(): void {},
  }
  const worldRuntime = new ClientWorldRuntime(adapter as never)
  worldRuntime.inventory = createEmptyInventory()
  worldRuntime.clientPlayerName = 'Alice'
  worldRuntime.clientPlayerEntityId = 'player:1'
  worldRuntime.applyPlayer(createCreativePlayerSnapshot())

  const chunk = worldRuntime.world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(BLOCK_IDS.air)
  chunk.dirty = true
  worldRuntime.world.setBlock(2, 2, 2, BLOCK_IDS.grass)
  worldRuntime.world.setBlock(3, 2, 2, BLOCK_IDS.grass)

  const player = new PlayerController()
  player.resetFromSnapshot(createCreativePlayerSnapshot())

  const settings = createDefaultClientSettings()
  const controller = new PlayController({
    nativeBridge: { getTime: () => 0 },
    player,
    menuSeed: 1,
    getClientAdapter: () => adapter as never,
    getWorldRuntime: () => worldRuntime,
    getClientSettings: () => settings,
    updateClientSettings: () => {},
    exitToMenu: async () => {},
    syncCursorMode: () => {},
  })

  return { controller, sentMessages, worldRuntime }
}

const countBreakMutations = (messages: readonly ClientToServerMessage[]): number =>
  messages.filter((message) => message.type === 'mutateBlock').length

test('creative mode breaks the first block immediately then delays the next held break', async () => {
  const { controller, sentMessages } = createHarness()

  await controller.tick({
    input: createInput({ breakBlock: true, breakBlockPressed: true }),
    accumulator: FIXED_TIMESTEP,
    pendingInputEdges: createPendingFixedStepInputEdges(),
    deltaTime: FIXED_TIMESTEP,
    smoothedFps: 60,
    serverTps: 60,
    connectionMode: 'local',
    currentWorldName: 'Alpha',
    currentWorldSeed: 42,
    lastServerMessage: '',
  })
  expect(countBreakMutations(sentMessages)).toBe(1)

  await controller.tick({
    input: createInput({ breakBlock: true, breakBlockPressed: false }),
    accumulator: FIXED_TIMESTEP,
    pendingInputEdges: createPendingFixedStepInputEdges(),
    deltaTime: FIXED_TIMESTEP,
    smoothedFps: 60,
    serverTps: 60,
    connectionMode: 'local',
    currentWorldName: 'Alpha',
    currentWorldSeed: 42,
    lastServerMessage: '',
  })
  expect(countBreakMutations(sentMessages)).toBe(1)

  await controller.tick({
    input: createInput({ breakBlock: true, breakBlockPressed: false }),
    accumulator: CREATIVE_BREAK_DURATION_MS / 1000,
    pendingInputEdges: createPendingFixedStepInputEdges(),
    deltaTime: CREATIVE_BREAK_DURATION_MS / 1000,
    smoothedFps: 60,
    serverTps: 60,
    connectionMode: 'local',
    currentWorldName: 'Alpha',
    currentWorldSeed: 42,
    lastServerMessage: '',
  })
  expect(countBreakMutations(sentMessages)).toBe(2)
})

test('right-clicking a crafting table sends useBlock instead of mutateBlock', async () => {
  const { controller, sentMessages, worldRuntime } = createHarness()
  worldRuntime.world.setBlock(2, 2, 2, BLOCK_IDS.craftingTable)

  await controller.tick({
    input: createInput({ placeBlockPressed: true }),
    accumulator: FIXED_TIMESTEP,
    pendingInputEdges: createPendingFixedStepInputEdges(),
    deltaTime: FIXED_TIMESTEP,
    smoothedFps: 60,
    serverTps: 60,
    connectionMode: 'local',
    currentWorldName: 'Alpha',
    currentWorldSeed: 42,
    lastServerMessage: '',
  })

  expect(sentMessages.find((message) => message.type === 'useBlock')).toEqual(
    expect.objectContaining({
      type: 'useBlock',
      payload: { x: 2, y: 2, z: 2 },
    }),
  )
  expect(sentMessages.some((message) => message.type === 'mutateBlock')).toBe(false)
})

test('escape closes an open crafting table immediately and notifies the server', async () => {
  const { controller, sentMessages, worldRuntime } = createHarness()
  worldRuntime.applyOpenContainer({
    kind: 'craftingTable',
    blockEntityId: 'block-entity:crafting-table:1',
    inputSlots: Array.from({ length: 9 }, () => ({
      itemId: ITEM_IDS.empty,
      count: 0,
    })),
  })

  await controller.tick({
    input: createInput({ exitPressed: true }),
    accumulator: FIXED_TIMESTEP,
    pendingInputEdges: createPendingFixedStepInputEdges(),
    deltaTime: FIXED_TIMESTEP,
    smoothedFps: 60,
    serverTps: 60,
    connectionMode: 'local',
    currentWorldName: 'Alpha',
    currentWorldSeed: 42,
    lastServerMessage: '',
  })

  expect(worldRuntime.openContainer).toBeNull()
  expect(controller.getOverlayState()).toEqual({
    inventoryOpen: false,
    pauseScreen: 'closed',
  })
  expect(sentMessages.find((message) => message.type === 'closeOpenContainer')).toEqual(
    expect.objectContaining({
      type: 'closeOpenContainer',
      payload: {},
    }),
  )
})

test('clicking an inventory browser item sends a grant request to the server', async () => {
  const { controller, sentMessages } = createHarness()

  const opened = await controller.tick({
    input: createInput({ inventoryToggle: true }),
    accumulator: FIXED_TIMESTEP,
    pendingInputEdges: createPendingFixedStepInputEdges(),
    deltaTime: FIXED_TIMESTEP,
    smoothedFps: 60,
    serverTps: 60,
    connectionMode: 'local',
    currentWorldName: 'Alpha',
    currentWorldSeed: 42,
    lastServerMessage: '',
  })

  const hotspot = opened.uiComponents.find(
    (component) => component.id === 'inventory-browser-item-0-hotspot',
  )
  expect(hotspot).toBeDefined()

  await controller.tick({
    input: createInput({
      breakBlock: true,
      breakBlockPressed: true,
      cursorX: (hotspot?.rect.x ?? 0) + Math.round((hotspot?.rect.width ?? 0) / 2),
      cursorY: (hotspot?.rect.y ?? 0) + Math.round((hotspot?.rect.height ?? 0) / 2),
    }),
    accumulator: FIXED_TIMESTEP,
    pendingInputEdges: createPendingFixedStepInputEdges(),
    deltaTime: FIXED_TIMESTEP,
    smoothedFps: 60,
    serverTps: 60,
    connectionMode: 'local',
    currentWorldName: 'Alpha',
    currentWorldSeed: 42,
    lastServerMessage: '',
  })

  expect(sentMessages.find((message) => message.type === 'requestInventoryBrowserItem')).toEqual(
    expect.objectContaining({
      type: 'requestInventoryBrowserItem',
      payload: { itemId: ITEM_IDS.grass },
    }),
  )
})
