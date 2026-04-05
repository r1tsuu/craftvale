import { expect, test } from 'bun:test'

import { buildPlayHud } from '../apps/client/src/ui/hud.ts'
import {
  getMainInventorySlotIndex,
  normalizeInventorySnapshot,
} from '../packages/core/src/world/inventory.ts'
import { ITEM_IDS } from '../packages/core/src/world/items.ts'
import { createTestStarterInventory } from './helpers/test-inventory.ts'

test('play HUD includes a centered crosshair', () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
  })
  const panels = hud.filter((component) => component.kind === 'panel')

  expect(panels).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'crosshair-horizontal',
        rect: { x: 640 - 7, y: 360 - 1, width: 14, height: 2 },
      }),
      expect.objectContaining({
        id: 'crosshair-vertical',
        rect: { x: 640 - 1, y: 360 - 7, width: 2, height: 14 },
      }),
    ]),
  )
})

test('play HUD can hide the crosshair from settings', () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    showCrosshair: false,
  })

  expect(hud.some((component) => component.id === 'crosshair-horizontal')).toBe(false)
  expect(hud.some((component) => component.id === 'crosshair-vertical')).toBe(false)
})

test('play HUD still renders the hotbar and selected slot label', () => {
  const inventory = normalizeInventorySnapshot({
    slots: [
      { itemId: ITEM_IDS.grass, count: 64 },
      { itemId: ITEM_IDS.empty, count: 0 },
      { itemId: ITEM_IDS.empty, count: 0 },
      { itemId: ITEM_IDS.empty, count: 0 },
      { itemId: ITEM_IDS.log, count: 64 },
    ],
    selectedSlot: 4,
    cursor: null,
  })
  const hud = buildPlayHud(1280, 720, {
    inventory,
  })
  const labels = hud.filter((component) => component.kind === 'label')

  expect(hud.some((component) => component.id === 'hotbar-backdrop')).toBe(true)
  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'hotbar-slot-0-icon',
        kind: 'item',
      }),
    ]),
  )
  expect(labels).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'hotbar-selected-label',
        text: '5. LOG  x64',
      }),
      expect.objectContaining({
        id: 'hotbar-slot-8-key',
        text: '9',
      }),
    ]),
  )
})

test('play HUD renders the current biome above the hotbar', () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    biomeName: 'FOREST',
  })
  const labels = hud.filter((component) => component.kind === 'label')

  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'biome-badge-frame',
        rect: { x: 540, y: 548, width: 200, height: 30 },
      }),
    ]),
  )
  expect(labels).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'biome-badge-label',
        text: 'BIOME: FOREST',
      }),
    ]),
  )
})

test('play HUD renders an authoritative world clock', () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    worldTime: {
      dayCount: 2,
      timeOfDayTicks: 18_000,
    },
  })

  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'clock-badge-label',
        text: 'DAY 3  12:00 AM',
      }),
    ]),
  )
})

test('play HUD renders chat and creative mode indicators', () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    gamemode: 1,
    flying: true,
    chatOpen: true,
    chatNowMs: 10_000,
    chatDraft: '/gamemode 1',
    chatMessages: [
      {
        kind: 'system',
        text: 'Gamemode set to creative.',
        receivedAt: 1_000,
      },
      {
        kind: 'player',
        senderName: 'Alice',
        text: 'hello',
        receivedAt: 2_000,
      },
    ],
  })

  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'mode-badge-label',
        text: 'MODE: CREATIVE FLY',
      }),
      expect.objectContaining({
        id: 'chat-input-label',
        text: '> /gamemode 1',
      }),
      expect.objectContaining({
        id: 'chat-feed-line-bg-0',
        rect: { x: 14, y: 492, width: 460, height: 22 },
        color: [0.03, 0.04, 0.05, 0.68],
      }),
      expect.objectContaining({
        id: 'chat-feed-line-0',
        text: 'Gamemode set to creative.',
      }),
      expect.objectContaining({
        id: 'chat-feed-line-1',
        text: 'Alice: hello',
      }),
    ]),
  )
})

test('play HUD uses bottom-left passive chat layout with fading opacity', () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    chatOpen: false,
    chatNowMs: 11_000,
    chatMessages: [
      {
        kind: 'player',
        senderName: 'Alice',
        text: 'fresh',
        receivedAt: 10_500,
      },
      {
        kind: 'system',
        text: 'older',
        receivedAt: 500,
      },
    ],
  })

  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'chat-feed-line-bg-0',
        rect: { x: 14, y: 534, width: 460, height: 22 },
        color: [0.03, 0.04, 0.05, 0.4],
      }),
      expect.objectContaining({
        id: 'chat-feed-line-bg-1',
        rect: { x: 14, y: 560, width: 460, height: 22 },
        color: [0.03, 0.04, 0.05, 0.2],
      }),
      expect.objectContaining({
        id: 'chat-feed-line-0',
        text: 'Alice: fresh',
      }),
      expect.objectContaining({
        id: 'chat-feed-line-1',
        text: 'older',
      }),
    ]),
  )
})

test('play HUD hides expired passive chat messages but keeps them while chat is open', () => {
  const closedHud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    chatOpen: false,
    chatNowMs: 20_000,
    chatMessages: [
      {
        kind: 'system',
        text: 'expired line',
        receivedAt: 1_000,
      },
    ],
  })

  const openHud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    chatOpen: true,
    chatNowMs: 20_000,
    chatDraft: '',
    chatMessages: [
      {
        kind: 'system',
        text: 'expired line',
        receivedAt: 1_000,
      },
    ],
  })

  expect(closedHud.some((component) => component.id === 'chat-feed-line-0')).toBe(false)
  expect(openHud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'chat-feed-line-0',
        text: 'expired line',
      }),
    ]),
  )
})

test('play HUD renders the full inventory overlay when inventory is open', () => {
  const inventory = createTestStarterInventory()
  inventory.slots[getMainInventorySlotIndex(0)] = { itemId: ITEM_IDS.log, count: 12 }
  inventory.cursor = { itemId: ITEM_IDS.brick, count: 8 }
  const hud = buildPlayHud(1280, 720, {
    inventory,
    inventoryOpen: true,
    cursorX: 700,
    cursorY: 420,
  })

  expect(hud.some((component) => component.id === 'crosshair-horizontal')).toBe(false)
  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'inventory-backdrop',
        rect: expect.objectContaining({ y: 162, height: 396 }),
      }),
      expect.objectContaining({
        id: 'inventory-player-preview',
        kind: 'playerPreview',
      }),
      expect.objectContaining({
        id: 'inventory-player-crafting-slot-0-hotspot',
        action: 'player-crafting-slot:0',
      }),
      expect.objectContaining({
        id: 'inventory-player-crafting-result-hotspot',
        action: 'player-crafting-result',
      }),
      expect.objectContaining({
        id: 'inventory-browser-backdrop',
      }),
      expect.objectContaining({
        id: 'inventory-browser-item-0-hotspot',
        action: `inventory-browser-item:${ITEM_IDS.grass}`,
      }),
      expect.objectContaining({
        id: 'inventory-browser-item-0-icon',
        kind: 'item',
      }),
      expect.objectContaining({
        id: 'inventory-main-slot-0-count',
        text: '12',
      }),
      expect.objectContaining({
        id: 'inventory-main-slot-0-icon',
        kind: 'item',
      }),
      expect.objectContaining({
        id: 'inventory-hotbar-slot-0-key',
        text: '1',
      }),
      expect.objectContaining({
        id: 'inventory-cursor-slot-count',
        text: '8',
      }),
    ]),
  )
  expect(hud.some((component) => component.id === 'inventory-title')).toBe(false)
})

test('play HUD keeps chat visible while inventory is open', () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    inventoryOpen: true,
    chatOpen: true,
    chatDraft: '/give glass 64',
    chatNowMs: 10_000,
    chatMessages: [
      {
        kind: 'system',
        text: 'Added 64 x GLASS.',
        receivedAt: 9_500,
      },
    ],
  })

  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'inventory-backdrop',
      }),
      expect.objectContaining({
        id: 'chat-feed-line-0',
        text: 'Added 64 x GLASS.',
      }),
      expect.objectContaining({
        id: 'chat-input-label',
        text: '> /give glass 64',
      }),
    ]),
  )
})

test('inventory player preview rotates with cursor position', () => {
  const leftHud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    inventoryOpen: true,
    cursorX: 360,
    cursorY: 240,
  })
  const rightHud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    inventoryOpen: true,
    cursorX: 520,
    cursorY: 240,
  })

  const leftPreview = leftHud.find((component) => component.id === 'inventory-player-preview') as
    | { yaw: number; pitch: number }
    | undefined
  const rightPreview = rightHud.find((component) => component.id === 'inventory-player-preview') as
    | { yaw: number; pitch: number }
    | undefined

  expect(leftPreview).toBeDefined()
  expect(rightPreview).toBeDefined()
  expect(leftPreview!.yaw).toBeGreaterThan(rightPreview!.yaw)
})

test('crafting table overlay reuses the compact inventory-width layout without labels', () => {
  const inventory = createTestStarterInventory()
  inventory.cursor = { itemId: ITEM_IDS.brick, count: 8 }
  const hud = buildPlayHud(1280, 720, {
    inventory,
    inventoryOpen: true,
    openContainer: {
      kind: 'craftingTable',
      blockEntityId: 'block-entity:crafting-table:1',
      inputSlots: Array.from({ length: 9 }, (_, index) =>
        index === 0 ? { itemId: ITEM_IDS.log, count: 1 } : { itemId: ITEM_IDS.empty, count: 0 },
      ),
    },
    cursorX: 700,
    cursorY: 420,
  })

  expect(hud.find((component) => component.id === 'crafting-table-backdrop')).toEqual(
    expect.objectContaining({
      rect: { x: 376, y: 162, width: 528, height: 396 },
    }),
  )
  expect(hud.find((component) => component.id === 'crafting-table-slot-0-hotspot')).toEqual(
    expect.objectContaining({
      action: 'open-container-slot:0',
      rect: { x: 515, y: 204, width: 42, height: 42 },
    }),
  )
  expect(hud.find((component) => component.id === 'crafting-table-result-hotspot')).toEqual(
    expect.objectContaining({
      action: 'open-container-result',
      rect: { x: 723, y: 248, width: 42, height: 42 },
    }),
  )
  expect(hud.find((component) => component.id === 'crafting-table-main-slot-0-hotspot')).toEqual(
    expect.objectContaining({
      action: 'inventory-slot:main:0',
      rect: { x: 412, y: 346, width: 42, height: 42 },
    }),
  )
  expect(hud.find((component) => component.id === 'crafting-table-hotbar-slot-0-key')).toEqual(
    expect.objectContaining({
      text: '1',
    }),
  )
  expect(hud.find((component) => component.id === 'crafting-table-hotbar-slot-0-hotspot')).toEqual(
    expect.objectContaining({
      rect: { x: 412, y: 492, width: 42, height: 42 },
    }),
  )
  expect(hud.find((component) => component.id === 'crafting-table-cursor-slot-count')).toEqual(
    expect.objectContaining({
      text: '8',
    }),
  )
  expect(hud.some((component) => component.id === 'inventory-browser-backdrop')).toBe(false)
  expect(hud.some((component) => component.id === 'crafting-table-title')).toBe(false)
  expect(hud.some((component) => component.id === 'crafting-table-grid-label')).toBe(false)
  expect(hud.some((component) => component.id === 'crafting-table-inventory-label')).toBe(false)
})

test('play HUD renders a pause menu overlay over gameplay', () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    pauseScreen: 'menu',
  })

  expect(hud.some((component) => component.id === 'hotbar-backdrop')).toBe(false)
  expect(hud.some((component) => component.id === 'crosshair-horizontal')).toBe(false)
  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'pause-title',
        text: 'GAME PAUSED',
      }),
      expect.objectContaining({
        id: 'pause-resume-button',
        action: 'pause-back-to-game',
      }),
      expect.objectContaining({
        id: 'pause-settings-button',
        action: 'pause-open-settings',
      }),
      expect.objectContaining({
        id: 'pause-exit-button',
        action: 'pause-exit-to-menu',
      }),
    ]),
  )

  const resumeButton = hud.find((component) => component.id === 'pause-resume-button')
  const settingsButton = hud.find((component) => component.id === 'pause-settings-button')
  const exitButton = hud.find((component) => component.id === 'pause-exit-button')
  expect(settingsButton?.rect.y).toBe(
    (resumeButton?.rect.y ?? 0) + (resumeButton?.rect.height ?? 0) + 18,
  )
  expect(exitButton?.rect.y).toBe(
    (settingsButton?.rect.y ?? 0) + (settingsButton?.rect.height ?? 0) + 18,
  )
  expect(hud.some((component) => component.id === 'pause-status-label')).toBe(false)
})

test('play HUD reuses the settings panel from pause context', () => {
  const hud = buildPlayHud(1280, 720, {
    inventory: createTestStarterInventory(),
    pauseScreen: 'settings',
    pauseSettings: {
      settings: {
        fovDegrees: 75,
        mouseSensitivity: 120,
        renderDistance: 4,
        showDebugOverlay: false,
        showCrosshair: true,
      },
      statusText: 'PAUSED',
      busy: false,
    },
  })

  expect(hud.some((component) => component.id === 'pause-settings-panel')).toBe(true)
  expect(hud).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'pause-settings-title',
        text: 'SETTINGS',
      }),
      expect.objectContaining({
        id: 'pause-settings-fov-value',
        text: '75',
      }),
      expect.objectContaining({
        id: 'pause-settings-crosshair-toggle',
        text: 'CROSSHAIR: ON',
      }),
      expect.objectContaining({
        id: 'pause-settings-back',
        action: 'back-to-pause',
      }),
    ]),
  )
})
