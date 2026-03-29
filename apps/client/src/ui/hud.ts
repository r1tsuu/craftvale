import type {
  ChatEntry,
  InventorySlot,
  InventorySnapshot,
  OpenContainerSnapshot,
  PlayerGamemode,
  WorldTimeState,
} from '@craftvale/core/shared'

import { ITEM_IDS } from '@craftvale/core/shared'
import {
  CRAFTING_TABLE_GRID_HEIGHT,
  CRAFTING_TABLE_GRID_WIDTH,
  createEmptyInventorySlot,
  formatWorldClock,
  getCraftingResult,
  getHotbarInventorySlots,
  getItemDisplayName,
  getMainInventorySlots,
  getPlayerCraftingInputSlots,
  getPlayerCraftingResult,
  getSelectedInventorySlot,
  PLAYER_CRAFTING_GRID_HEIGHT,
  PLAYER_CRAFTING_GRID_WIDTH,
} from '@craftvale/core/shared'

import type { PauseScreen } from '../game/play-overlay.ts'

import { measureTextWidth } from '../render/text-mesh.ts'
import {
  createHotspot,
  createItem,
  createLabel,
  createPanel,
  type UiComponent,
} from './components.ts'
import {
  buildPauseMenuOverlay,
  buildPauseSettingsOverlay,
  type SettingsPanelViewModel,
} from './menu.ts'

const HOTBAR_SAFE_TOP_OFFSET = 126
const CHAT_MARGIN_LEFT = 14
const CHAT_GAP_ABOVE_HOTBAR = 12
const CHAT_FEED_TO_INPUT_GAP = 6
const CHAT_WIDTH = 460
const CHAT_LINE_HEIGHT = 22
const CHAT_LINE_GAP = 4
const CHAT_TEXT_SCALE = 2
const CHAT_OPEN_MAX_LINES = 8
const CHAT_CLOSED_MAX_LINES = 5
const CHAT_PASSIVE_LIFETIME_MS = 9000
const CHAT_FADE_DURATION_MS = 3000
const CHAT_INPUT_HEIGHT = 36
const CHAT_INPUT_FRAME_ALPHA = 0.6
const CHAT_INPUT_INNER_ALPHA = 0.82
const CHAT_OPEN_LINE_ALPHA = 0.68
const CHAT_CLOSED_LINE_ALPHA = 0.4
const INVENTORY_PANEL_WIDTH = 642
const PLAYER_INVENTORY_PANEL_WIDTH = 604
const INVENTORY_PANEL_HEIGHT = 396
const INVENTORY_SLOT_SIZE = 42
const INVENTORY_SLOT_GAP = 6

interface VisibleChatLine {
  entry: ChatEntry
  opacity: number
}

const isEmptyInventorySlot = (slot: InventorySlot | null | undefined): boolean =>
  !slot || slot.itemId === ITEM_IDS.empty || slot.count <= 0

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const getChatLineText = (entry: ChatEntry): string =>
  entry.kind === 'player' ? `${entry.senderName ?? 'Unknown'}: ${entry.text}` : entry.text

const getVisibleChatLines = (
  chatMessages: readonly ChatEntry[],
  chatOpen: boolean,
  nowMs: number,
): VisibleChatLine[] => {
  if (chatMessages.length === 0) {
    return []
  }

  if (chatOpen) {
    return chatMessages.slice(-CHAT_OPEN_MAX_LINES).map((entry) => ({
      entry,
      opacity: 1,
    }))
  }

  return chatMessages
    .map((entry) => {
      const ageMs = Math.max(0, nowMs - entry.receivedAt)
      if (ageMs > CHAT_PASSIVE_LIFETIME_MS + CHAT_FADE_DURATION_MS) {
        return null
      }

      const fadeProgress =
        ageMs <= CHAT_PASSIVE_LIFETIME_MS
          ? 0
          : (ageMs - CHAT_PASSIVE_LIFETIME_MS) / CHAT_FADE_DURATION_MS
      return {
        entry,
        opacity: clamp01(1 - fadeProgress),
      }
    })
    .filter((line): line is VisibleChatLine => line !== null)
    .slice(-CHAT_CLOSED_MAX_LINES)
}

const getSlotDisplayName = (slot: InventorySlot): string =>
  isEmptyInventorySlot(slot) ? 'EMPTY' : getItemDisplayName(slot.itemId).toUpperCase()

const buildCrosshair = (windowWidth: number, windowHeight: number): UiComponent[] => {
  const centerX = Math.round(windowWidth / 2)
  const centerY = Math.round(windowHeight / 2)
  const innerColor: readonly [number, number, number] = [0.96, 0.96, 0.96]
  const outlineColor: readonly [number, number, number] = [0.08, 0.08, 0.08]

  return [
    createPanel({
      id: 'crosshair-horizontal-outline',
      kind: 'panel',
      rect: { x: centerX - 9, y: centerY - 2, width: 18, height: 4 },
      color: outlineColor,
    }),
    createPanel({
      id: 'crosshair-vertical-outline',
      kind: 'panel',
      rect: { x: centerX - 2, y: centerY - 9, width: 4, height: 18 },
      color: outlineColor,
    }),
    createPanel({
      id: 'crosshair-horizontal',
      kind: 'panel',
      rect: { x: centerX - 7, y: centerY - 1, width: 14, height: 2 },
      color: innerColor,
    }),
    createPanel({
      id: 'crosshair-vertical',
      kind: 'panel',
      rect: { x: centerX - 1, y: centerY - 7, width: 2, height: 14 },
      color: innerColor,
    }),
  ]
}

const buildInventorySlotVisual = (
  idPrefix: string,
  rect: { x: number; y: number; width: number; height: number },
  slot: InventorySlot,
  options: {
    keyText?: string
    selected?: boolean
    interactive?: boolean
    action?: string
  } = {},
): UiComponent[] => {
  const components: UiComponent[] = []
  const selected = options.selected ?? false
  components.push(
    createPanel({
      id: `${idPrefix}-frame`,
      kind: 'panel',
      rect,
      color: selected ? [0.91, 0.85, 0.37] : [0.18, 0.19, 0.2],
    }),
    createPanel({
      id: `${idPrefix}-inner`,
      kind: 'panel',
      rect: {
        x: rect.x + 4,
        y: rect.y + 4,
        width: rect.width - 8,
        height: rect.height - 8,
      },
      color: selected ? [0.28, 0.24, 0.12] : [0.28, 0.3, 0.33],
    }),
  )

  if (!isEmptyInventorySlot(slot)) {
    components.push(
      createItem({
        id: `${idPrefix}-icon`,
        kind: 'item',
        rect: {
          x: rect.x + 6,
          y: rect.y + 8,
          width: rect.width - 12,
          height: rect.height - 14,
        },
        itemId: slot.itemId,
      }),
      createLabel({
        id: `${idPrefix}-count`,
        kind: 'label',
        rect: {
          x: rect.x + 4,
          y: rect.y + rect.height - 18,
          width: rect.width - 8,
          height: 12,
        },
        text: `${slot.count}`,
        scale: 1,
        color: [0.97, 0.97, 0.97],
        centered: true,
      }),
    )
  }

  if (options.keyText) {
    components.push(
      createLabel({
        id: `${idPrefix}-key`,
        kind: 'label',
        rect: {
          x: rect.x + 6,
          y: rect.y + 5,
          width: 12,
          height: 12,
        },
        text: options.keyText,
        scale: 1,
        color: selected ? [0.15, 0.14, 0.08] : [0.96, 0.96, 0.96],
      }),
    )
  }

  if (options.interactive && options.action) {
    components.push(
      createHotspot({
        id: `${idPrefix}-hotspot`,
        kind: 'hotspot',
        rect,
        action: options.action,
      }),
    )
  }

  return components
}

const buildCraftingArrow = (
  idPrefix: string,
  rect: { x: number; y: number; width: number; height: number },
): UiComponent[] => [
  createLabel({
    id: `${idPrefix}-label`,
    kind: 'label',
    rect,
    text: '=>',
    scale: 3,
    color: [0.94, 0.95, 0.97],
    centered: true,
  }),
]

const buildCraftingSectionLabel = (
  id: string,
  rect: { x: number; y: number; width: number; height: number },
  text: string,
): UiComponent =>
  createLabel({
    id,
    kind: 'label',
    rect,
    text,
    scale: 2,
    color: [0.86, 0.88, 0.9],
  })

const buildCraftingInputGrid = (
  idPrefix: string,
  startX: number,
  startY: number,
  width: number,
  height: number,
  slots: readonly InventorySlot[],
  actionPrefix: string,
): UiComponent[] => {
  const components: UiComponent[] = []

  for (let index = 0; index < slots.length; index += 1) {
    const col = index % width
    const row = Math.floor(index / width)
    if (row >= height) {
      break
    }

    components.push(
      ...buildInventorySlotVisual(
        `${idPrefix}-${index}`,
        {
          x: startX + col * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP),
          y: startY + row * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP),
          width: INVENTORY_SLOT_SIZE,
          height: INVENTORY_SLOT_SIZE,
        },
        slots[index]!,
        {
          interactive: true,
          action: `${actionPrefix}:${index}`,
        },
      ),
    )
  }

  return components
}

const buildHotbar = (
  windowWidth: number,
  windowHeight: number,
  inventory: InventorySnapshot,
): UiComponent[] => {
  const selectedSlotIndex = inventory.selectedSlot
  const selectedSlot = getSelectedInventorySlot(inventory)
  const hotbarSlots = getHotbarInventorySlots(inventory)
  const slotWidth = 68
  const slotHeight = 68
  const slotGap = 8
  const totalWidth = hotbarSlots.length * slotWidth + (hotbarSlots.length - 1) * slotGap
  const startX = Math.round((windowWidth - totalWidth) / 2)
  const startY = windowHeight - 96
  const components: UiComponent[] = []

  components.push(
    createPanel({
      id: 'hotbar-backdrop',
      kind: 'panel',
      rect: {
        x: startX - 16,
        y: startY - 30,
        width: totalWidth + 32,
        height: slotHeight + 40,
      },
      color: [0.08, 0.09, 0.1],
    }),
    createLabel({
      id: 'hotbar-selected-label',
      kind: 'label',
      rect: {
        x: startX - 16,
        y: startY - 24,
        width: totalWidth + 32,
        height: 18,
      },
      text: `${selectedSlotIndex + 1}. ${getSlotDisplayName(selectedSlot)}${isEmptyInventorySlot(selectedSlot) ? '' : `  x${selectedSlot.count}`}`,
      scale: 2,
      color: [0.99, 0.95, 0.78],
      centered: true,
    }),
  )

  hotbarSlots.forEach((slot, index) => {
    const slotX = startX + index * (slotWidth + slotGap)
    components.push(
      ...buildInventorySlotVisual(
        `hotbar-slot-${index}`,
        {
          x: slotX,
          y: startY,
          width: slotWidth,
          height: slotHeight,
        },
        slot,
        {
          keyText: String(index + 1),
          selected: index === selectedSlotIndex,
        },
      ),
    )
  })

  return components
}

const buildBiomeBadge = (
  windowWidth: number,
  windowHeight: number,
  biomeName: string,
): UiComponent[] => {
  const badgeWidth = 200
  const badgeHeight = 30
  const x = Math.round((windowWidth - badgeWidth) / 2)
  const y = windowHeight - 172

  return [
    createPanel({
      id: 'biome-badge-frame',
      kind: 'panel',
      rect: { x, y, width: badgeWidth, height: badgeHeight },
      color: [0.12, 0.14, 0.11],
    }),
    createPanel({
      id: 'biome-badge-inner',
      kind: 'panel',
      rect: { x: x + 3, y: y + 3, width: badgeWidth - 6, height: badgeHeight - 6 },
      color: [0.33, 0.42, 0.24],
    }),
    createLabel({
      id: 'biome-badge-label',
      kind: 'label',
      rect: { x, y, width: badgeWidth, height: badgeHeight },
      text: `BIOME: ${biomeName}`,
      scale: 2,
      color: [0.95, 0.97, 0.9],
      centered: true,
    }),
  ]
}

const buildModeBadge = (
  windowWidth: number,
  gamemode: PlayerGamemode,
  flying: boolean,
): UiComponent[] => {
  const badgeWidth = 190
  const badgeHeight = 28
  const x = windowWidth - badgeWidth - 20
  const y = 20
  const creative = gamemode === 1
  const text = creative ? (flying ? 'MODE: CREATIVE FLY' : 'MODE: CREATIVE') : 'MODE: NORMAL'

  return [
    createPanel({
      id: 'mode-badge-frame',
      kind: 'panel',
      rect: { x, y, width: badgeWidth, height: badgeHeight },
      color: creative ? [0.28, 0.2, 0.08] : [0.11, 0.12, 0.14],
    }),
    createPanel({
      id: 'mode-badge-inner',
      kind: 'panel',
      rect: { x: x + 3, y: y + 3, width: badgeWidth - 6, height: badgeHeight - 6 },
      color: creative ? [0.78, 0.58, 0.16] : [0.25, 0.28, 0.31],
    }),
    createLabel({
      id: 'mode-badge-label',
      kind: 'label',
      rect: { x, y, width: badgeWidth, height: badgeHeight },
      text,
      scale: 2,
      color: creative ? [0.13, 0.09, 0.02] : [0.95, 0.97, 0.99],
      centered: true,
    }),
  ]
}

const buildClockBadge = (
  windowWidth: number,
  worldTime: WorldTimeState | null | undefined,
): UiComponent[] => {
  if (!worldTime) {
    return []
  }

  const width = 220
  const x = windowWidth - width - 18
  return [
    createPanel({
      id: 'clock-badge-frame',
      kind: 'panel',
      rect: { x, y: 54, width, height: 30 },
      color: [0.08, 0.09, 0.1],
    }),
    createLabel({
      id: 'clock-badge-label',
      kind: 'label',
      rect: { x, y: 60, width, height: 18 },
      text: formatWorldClock(worldTime).toUpperCase(),
      scale: 2,
      color: [0.98, 0.95, 0.78],
      centered: true,
    }),
  ]
}

const buildChatFeed = (
  windowWidth: number,
  windowHeight: number,
  chatMessages: readonly ChatEntry[],
  chatOpen: boolean,
  nowMs: number,
): UiComponent[] => {
  const visibleLines = getVisibleChatLines(chatMessages, chatOpen, nowMs)
  if (visibleLines.length === 0) {
    return []
  }

  const lineWidth = Math.min(CHAT_WIDTH, windowWidth - CHAT_MARGIN_LEFT * 2)
  const totalHeight =
    visibleLines.length * CHAT_LINE_HEIGHT + (visibleLines.length - 1) * CHAT_LINE_GAP
  const hotbarTop = windowHeight - HOTBAR_SAFE_TOP_OFFSET
  const feedBottom = chatOpen
    ? hotbarTop - CHAT_GAP_ABOVE_HOTBAR - CHAT_INPUT_HEIGHT - CHAT_FEED_TO_INPUT_GAP
    : hotbarTop - CHAT_GAP_ABOVE_HOTBAR
  const x = CHAT_MARGIN_LEFT
  const startY = feedBottom - totalHeight
  const components: UiComponent[] = []

  visibleLines.forEach(({ entry, opacity }, index) => {
    const text = getChatLineText(entry)
    const y = startY + index * (CHAT_LINE_HEIGHT + CHAT_LINE_GAP)
    const backgroundAlpha = (chatOpen ? CHAT_OPEN_LINE_ALPHA : CHAT_CLOSED_LINE_ALPHA) * opacity
    const textAlpha = (chatOpen ? 1 : 0.94) * opacity

    components.push(
      createPanel({
        id: `chat-feed-line-bg-${index}`,
        kind: 'panel',
        rect: {
          x,
          y,
          width: lineWidth,
          height: CHAT_LINE_HEIGHT,
        },
        color: [0.03, 0.04, 0.05, backgroundAlpha],
      }),
      createLabel({
        id: `chat-feed-line-${index}`,
        kind: 'label',
        rect: {
          x: x + 8,
          y,
          width: Math.min(lineWidth - 16, measureTextWidth(text, CHAT_TEXT_SCALE)),
          height: CHAT_LINE_HEIGHT,
        },
        text,
        scale: CHAT_TEXT_SCALE,
        color:
          entry.kind === 'player' ? [0.94, 0.95, 0.98, textAlpha] : [0.99, 0.88, 0.55, textAlpha],
      }),
    )
  })

  return components
}

const buildChatInput = (
  windowWidth: number,
  windowHeight: number,
  draft: string,
): UiComponent[] => {
  const width = Math.min(CHAT_WIDTH, windowWidth - CHAT_MARGIN_LEFT * 2)
  const height = CHAT_INPUT_HEIGHT
  const x = CHAT_MARGIN_LEFT
  const y = windowHeight - HOTBAR_SAFE_TOP_OFFSET - CHAT_GAP_ABOVE_HOTBAR - height
  return [
    createPanel({
      id: 'chat-input-frame',
      kind: 'panel',
      rect: { x, y, width, height },
      color: [0.05, 0.06, 0.07, CHAT_INPUT_FRAME_ALPHA],
    }),
    createPanel({
      id: 'chat-input-inner',
      kind: 'panel',
      rect: { x: x + 3, y: y + 3, width: width - 6, height: height - 6 },
      color: [0.1, 0.11, 0.13, CHAT_INPUT_INNER_ALPHA],
    }),
    createLabel({
      id: 'chat-input-label',
      kind: 'label',
      rect: { x: x + 10, y, width: width - 20, height },
      text: `> ${draft || '_'}`,
      scale: CHAT_TEXT_SCALE,
      color: [0.96, 0.97, 0.99, 1],
    }),
  ]
}

const buildInventoryOverlay = (
  windowWidth: number,
  windowHeight: number,
  inventory: InventorySnapshot,
  cursorX: number,
  cursorY: number,
): UiComponent[] => {
  const mainSlots = getMainInventorySlots(inventory)
  const hotbarSlots = getHotbarInventorySlots(inventory)
  const playerCraftingInput = getPlayerCraftingInputSlots(inventory)
  const playerCraftingResult = getPlayerCraftingResult(inventory)
  const x = Math.round((windowWidth - PLAYER_INVENTORY_PANEL_WIDTH) / 2)
  const y = Math.round((windowHeight - INVENTORY_PANEL_HEIGHT) / 2)
  const components: UiComponent[] = [
    createPanel({
      id: 'inventory-backdrop',
      kind: 'panel',
      rect: { x, y, width: PLAYER_INVENTORY_PANEL_WIDTH, height: INVENTORY_PANEL_HEIGHT },
      color: [0.05, 0.06, 0.08, 0.92],
    }),
    createPanel({
      id: 'inventory-inner',
      kind: 'panel',
      rect: {
        x: x + 6,
        y: y + 6,
        width: PLAYER_INVENTORY_PANEL_WIDTH - 12,
        height: INVENTORY_PANEL_HEIGHT - 12,
      },
      color: [0.14, 0.16, 0.18, 0.96],
    }),
    createLabel({
      id: 'inventory-title',
      kind: 'label',
      rect: { x: x + 24, y: y + 18, width: 220, height: 22 },
      text: 'INVENTORY',
      scale: 3,
      color: [0.96, 0.97, 0.99],
    }),
  ]

  const gridStartX = x + 36
  const mainStartY = y + 166
  const craftingStartX = x + 368
  const craftingStartY = y + 56
  components.push(
    ...buildCraftingInputGrid(
      'inventory-player-crafting-slot',
      craftingStartX,
      craftingStartY,
      PLAYER_CRAFTING_GRID_WIDTH,
      PLAYER_CRAFTING_GRID_HEIGHT,
      playerCraftingInput,
      'player-crafting-slot',
    ),
    ...buildCraftingArrow('inventory-player-crafting-arrow', {
      x: craftingStartX + 2 * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP) + 8,
      y: craftingStartY + 16,
      width: 32,
      height: INVENTORY_SLOT_SIZE,
    }),
    ...buildInventorySlotVisual(
      'inventory-player-crafting-result',
      {
        x: craftingStartX + 2 * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP) + 44,
        y: craftingStartY + 20,
        width: INVENTORY_SLOT_SIZE,
        height: INVENTORY_SLOT_SIZE,
      },
      playerCraftingResult ?? createEmptyInventorySlot(),
      {
        interactive: true,
        action: 'player-crafting-result',
      },
    ),
  )

  for (let index = 0; index < mainSlots.length; index += 1) {
    const col = index % 9
    const row = Math.floor(index / 9)
    components.push(
      ...buildInventorySlotVisual(
        `inventory-main-slot-${index}`,
        {
          x: gridStartX + col * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP),
          y: mainStartY + row * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP),
          width: INVENTORY_SLOT_SIZE,
          height: INVENTORY_SLOT_SIZE,
        },
        mainSlots[index]!,
        {
          interactive: true,
          action: `inventory-slot:main:${index}`,
        },
      ),
    )
  }

  const hotbarStartY = y + INVENTORY_PANEL_HEIGHT - 66
  for (let index = 0; index < hotbarSlots.length; index += 1) {
    components.push(
      ...buildInventorySlotVisual(
        `inventory-hotbar-slot-${index}`,
        {
          x: gridStartX + index * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP),
          y: hotbarStartY,
          width: INVENTORY_SLOT_SIZE,
          height: INVENTORY_SLOT_SIZE,
        },
        hotbarSlots[index]!,
        {
          interactive: true,
          action: `inventory-slot:hotbar:${index}`,
          selected: inventory.selectedSlot === index,
          keyText: String(index + 1),
        },
      ),
    )
  }

  if (!isEmptyInventorySlot(inventory.cursor)) {
    components.push(
      ...buildInventorySlotVisual(
        'inventory-cursor-slot',
        {
          x: Math.round(cursorX - INVENTORY_SLOT_SIZE / 2),
          y: Math.round(cursorY - INVENTORY_SLOT_SIZE / 2),
          width: INVENTORY_SLOT_SIZE,
          height: INVENTORY_SLOT_SIZE,
        },
        inventory.cursor!,
      ),
    )
  }

  return components
}

const buildCraftingTableOverlay = (
  windowWidth: number,
  windowHeight: number,
  inventory: InventorySnapshot,
  openContainer: OpenContainerSnapshot,
  cursorX: number,
  cursorY: number,
): UiComponent[] => {
  const mainSlots = getMainInventorySlots(inventory)
  const hotbarSlots = getHotbarInventorySlots(inventory)
  const craftingResult = getCraftingResult(
    openContainer.inputSlots,
    CRAFTING_TABLE_GRID_WIDTH,
    CRAFTING_TABLE_GRID_HEIGHT,
  )
  const x = Math.round((windowWidth - INVENTORY_PANEL_WIDTH) / 2)
  const y = Math.round((windowHeight - INVENTORY_PANEL_HEIGHT) / 2)
  const components: UiComponent[] = [
    createPanel({
      id: 'crafting-table-backdrop',
      kind: 'panel',
      rect: { x, y, width: INVENTORY_PANEL_WIDTH, height: INVENTORY_PANEL_HEIGHT },
      color: [0.05, 0.06, 0.08, 0.92],
    }),
    createPanel({
      id: 'crafting-table-inner',
      kind: 'panel',
      rect: {
        x: x + 6,
        y: y + 6,
        width: INVENTORY_PANEL_WIDTH - 12,
        height: INVENTORY_PANEL_HEIGHT - 12,
      },
      color: [0.14, 0.16, 0.18, 0.96],
    }),
    createLabel({
      id: 'crafting-table-title',
      kind: 'label',
      rect: { x: x + 24, y: y + 18, width: 320, height: 22 },
      text: 'CRAFTING TABLE',
      scale: 3,
      color: [0.96, 0.97, 0.99],
    }),
    buildCraftingSectionLabel(
      'crafting-table-grid-label',
      { x: x + 36, y: y + 62, width: 240, height: 18 },
      'CRAFTING 3x3',
    ),
    buildCraftingSectionLabel(
      'crafting-table-inventory-label',
      { x: x + 36, y: y + 164, width: 240, height: 18 },
      'INVENTORY',
    ),
  ]

  const craftingStartX = x + 36
  const craftingStartY = y + 92
  components.push(
    ...buildCraftingInputGrid(
      'crafting-table-slot',
      craftingStartX,
      craftingStartY,
      CRAFTING_TABLE_GRID_WIDTH,
      CRAFTING_TABLE_GRID_HEIGHT,
      openContainer.inputSlots,
      'open-container-slot',
    ),
    ...buildCraftingArrow('crafting-table-arrow', {
      x: craftingStartX + 3 * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP) + 10,
      y: craftingStartY + INVENTORY_SLOT_SIZE + 4,
      width: 44,
      height: INVENTORY_SLOT_SIZE,
    }),
    ...buildInventorySlotVisual(
      'crafting-table-result',
      {
        x: craftingStartX + 3 * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP) + 64,
        y: craftingStartY + INVENTORY_SLOT_SIZE + 2,
        width: INVENTORY_SLOT_SIZE,
        height: INVENTORY_SLOT_SIZE,
      },
      craftingResult ?? createEmptyInventorySlot(),
      {
        interactive: true,
        action: 'open-container-result',
      },
    ),
  )

  const inventoryStartX = x + 36
  const inventoryStartY = y + 194
  for (let index = 0; index < mainSlots.length; index += 1) {
    const col = index % 9
    const row = Math.floor(index / 9)
    components.push(
      ...buildInventorySlotVisual(
        `crafting-table-main-slot-${index}`,
        {
          x: inventoryStartX + col * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP),
          y: inventoryStartY + row * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP),
          width: INVENTORY_SLOT_SIZE,
          height: INVENTORY_SLOT_SIZE,
        },
        mainSlots[index]!,
        {
          interactive: true,
          action: `inventory-slot:main:${index}`,
        },
      ),
    )
  }

  const hotbarStartY = y + INVENTORY_PANEL_HEIGHT - 86
  for (let index = 0; index < hotbarSlots.length; index += 1) {
    components.push(
      ...buildInventorySlotVisual(
        `crafting-table-hotbar-slot-${index}`,
        {
          x: inventoryStartX + index * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP),
          y: hotbarStartY,
          width: INVENTORY_SLOT_SIZE,
          height: INVENTORY_SLOT_SIZE,
        },
        hotbarSlots[index]!,
        {
          interactive: true,
          action: `inventory-slot:hotbar:${index}`,
          selected: inventory.selectedSlot === index,
          keyText: String(index + 1),
        },
      ),
    )
  }

  if (!isEmptyInventorySlot(inventory.cursor)) {
    components.push(
      ...buildInventorySlotVisual(
        'crafting-table-cursor-slot',
        {
          x: Math.round(cursorX - INVENTORY_SLOT_SIZE / 2),
          y: Math.round(cursorY - INVENTORY_SLOT_SIZE / 2),
          width: INVENTORY_SLOT_SIZE,
          height: INVENTORY_SLOT_SIZE,
        },
        inventory.cursor!,
      ),
    )
  }

  return components
}

export interface PlayHudState {
  inventory: InventorySnapshot
  worldTime?: WorldTimeState | null
  inventoryOpen?: boolean
  openContainer?: OpenContainerSnapshot | null
  cursorX?: number
  cursorY?: number
  showCrosshair?: boolean
  pauseScreen?: PauseScreen
  pauseSettings?: SettingsPanelViewModel
  biomeName?: string | null
  chatMessages?: readonly ChatEntry[]
  chatNowMs?: number
  chatDraft?: string
  chatOpen?: boolean
  gamemode?: PlayerGamemode
  flying?: boolean
}

export const buildPlayHud = (
  windowWidth: number,
  windowHeight: number,
  state: PlayHudState,
): UiComponent[] => {
  if (state.pauseScreen === 'settings' && state.pauseSettings) {
    return buildPauseSettingsOverlay(windowWidth, windowHeight, state.pauseSettings)
  }

  if (state.pauseScreen === 'menu') {
    return buildPauseMenuOverlay(windowWidth, windowHeight)
  }

  const overlayOpen = Boolean(state.inventoryOpen || state.openContainer)

  return [
    ...(overlayOpen || state.showCrosshair === false
      ? []
      : buildCrosshair(windowWidth, windowHeight)),
    ...(!overlayOpen ? buildClockBadge(windowWidth, state.worldTime) : []),
    ...(state.biomeName && !overlayOpen
      ? buildBiomeBadge(windowWidth, windowHeight, state.biomeName)
      : []),
    ...buildModeBadge(windowWidth, state.gamemode ?? 0, state.flying ?? false),
    ...(!overlayOpen
      ? buildChatFeed(
          windowWidth,
          windowHeight,
          state.chatMessages ?? [],
          state.chatOpen ?? false,
          state.chatNowMs ?? Date.now(),
        )
      : []),
    ...(!overlayOpen && state.chatOpen
      ? buildChatInput(windowWidth, windowHeight, state.chatDraft ?? '')
      : []),
    ...(state.openContainer
      ? buildCraftingTableOverlay(
          windowWidth,
          windowHeight,
          state.inventory,
          state.openContainer,
          state.cursorX ?? 0,
          state.cursorY ?? 0,
        )
      : state.inventoryOpen
        ? buildInventoryOverlay(
            windowWidth,
            windowHeight,
            state.inventory,
            state.cursorX ?? 0,
            state.cursorY ?? 0,
          )
        : buildHotbar(windowWidth, windowHeight, state.inventory)),
  ]
}
