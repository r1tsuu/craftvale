import type { ChatEntry, InventorySnapshot, PlayerGamemode } from "../types.ts";
import { measureTextWidth } from "../render/text-mesh.ts";
import { Blocks } from "../world/blocks.ts";
import { getSelectedInventorySlot } from "../world/inventory.ts";
import {
  createLabel,
  createPanel,
  type UiResolvedComponent,
} from "./components.ts";

const HOTBAR_SAFE_TOP_OFFSET = 126;
const CHAT_MARGIN_LEFT = 14;
const CHAT_GAP_ABOVE_HOTBAR = 12;
const CHAT_FEED_TO_INPUT_GAP = 6;
const CHAT_WIDTH = 460;
const CHAT_LINE_HEIGHT = 22;
const CHAT_LINE_GAP = 4;
const CHAT_TEXT_SCALE = 2;
const CHAT_OPEN_MAX_LINES = 8;
const CHAT_CLOSED_MAX_LINES = 5;
const CHAT_PASSIVE_LIFETIME_MS = 9000;
const CHAT_FADE_DURATION_MS = 3000;
const CHAT_INPUT_HEIGHT = 36;
const CHAT_INPUT_FRAME_ALPHA = 0.6;
const CHAT_INPUT_INNER_ALPHA = 0.82;
const CHAT_OPEN_LINE_ALPHA = 0.68;
const CHAT_CLOSED_LINE_ALPHA = 0.4;

interface VisibleChatLine {
  entry: ChatEntry;
  opacity: number;
}

const withAlpha = (
  color: readonly [number, number, number],
  alpha: number,
): readonly [number, number, number, number] => [color[0], color[1], color[2], alpha];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const getChatLineText = (entry: ChatEntry): string =>
  entry.kind === "player"
    ? `${entry.senderName ?? "Unknown"}: ${entry.text}`
    : entry.text;

const getVisibleChatLines = (
  chatMessages: readonly ChatEntry[],
  chatOpen: boolean,
  nowMs: number,
): VisibleChatLine[] => {
  if (chatMessages.length === 0) {
    return [];
  }

  if (chatOpen) {
    return chatMessages.slice(-CHAT_OPEN_MAX_LINES).map((entry) => ({
      entry,
      opacity: 1,
    }));
  }

  return chatMessages
    .map((entry) => {
      const ageMs = Math.max(0, nowMs - entry.receivedAt);
      if (ageMs > CHAT_PASSIVE_LIFETIME_MS + CHAT_FADE_DURATION_MS) {
        return null;
      }

      const fadeProgress = ageMs <= CHAT_PASSIVE_LIFETIME_MS
        ? 0
        : (ageMs - CHAT_PASSIVE_LIFETIME_MS) / CHAT_FADE_DURATION_MS;
      return {
        entry,
        opacity: clamp01(1 - fadeProgress),
      };
    })
    .filter((line): line is VisibleChatLine => line !== null)
    .slice(-CHAT_CLOSED_MAX_LINES);
};

const buildCrosshair = (windowWidth: number, windowHeight: number): UiResolvedComponent[] => {
  const centerX = Math.round(windowWidth / 2);
  const centerY = Math.round(windowHeight / 2);
  const innerColor: readonly [number, number, number] = [0.96, 0.96, 0.96];
  const outlineColor: readonly [number, number, number] = [0.08, 0.08, 0.08];

  return [
    createPanel({
      id: "crosshair-horizontal-outline",
      kind: "panel",
      rect: { x: centerX - 9, y: centerY - 2, width: 18, height: 4 },
      color: outlineColor,
    }),
    createPanel({
      id: "crosshair-vertical-outline",
      kind: "panel",
      rect: { x: centerX - 2, y: centerY - 9, width: 4, height: 18 },
      color: outlineColor,
    }),
    createPanel({
      id: "crosshair-horizontal",
      kind: "panel",
      rect: { x: centerX - 7, y: centerY - 1, width: 14, height: 2 },
      color: innerColor,
    }),
    createPanel({
      id: "crosshair-vertical",
      kind: "panel",
      rect: { x: centerX - 1, y: centerY - 7, width: 2, height: 14 },
      color: innerColor,
    }),
  ];
};

const buildHotbar = (
  windowWidth: number,
  windowHeight: number,
  inventory: InventorySnapshot,
): UiResolvedComponent[] => {
  const selectedSlotIndex = inventory.selectedSlot;
  const selectedSlot = getSelectedInventorySlot(inventory);
  const slotWidth = 68;
  const slotHeight = 68;
  const slotGap = 8;
  const totalWidth = inventory.slots.length * slotWidth + (inventory.slots.length - 1) * slotGap;
  const startX = Math.round((windowWidth - totalWidth) / 2);
  const startY = windowHeight - 96;
  const components: UiResolvedComponent[] = [];

  components.push(
    createPanel({
      id: "hotbar-backdrop",
      kind: "panel",
      rect: {
        x: startX - 16,
        y: startY - 30,
        width: totalWidth + 32,
        height: slotHeight + 40,
      },
      color: [0.08, 0.09, 0.1],
    }),
    createLabel({
      id: "hotbar-selected-label",
      kind: "label",
      rect: {
        x: startX - 16,
        y: startY - 24,
        width: totalWidth + 32,
        height: 18,
      },
      text: `${selectedSlotIndex + 1}. ${Blocks[selectedSlot.blockId].name.toUpperCase()}  x${selectedSlot.count}`,
      scale: 2,
      color: [0.99, 0.95, 0.78],
      centered: true,
    }),
  );

  inventory.slots.forEach((slot, index) => {
    const slotX = startX + index * (slotWidth + slotGap);
    const selected = index === selectedSlotIndex;
    const block = Blocks[slot.blockId];

    components.push(
      createPanel({
        id: `hotbar-slot-frame-${index}`,
        kind: "panel",
        rect: {
          x: slotX,
          y: startY,
          width: slotWidth,
          height: slotHeight,
        },
        color: selected ? [0.91, 0.85, 0.37] : [0.18, 0.19, 0.2],
      }),
      createPanel({
        id: `hotbar-slot-inner-${index}`,
        kind: "panel",
        rect: {
          x: slotX + 4,
          y: startY + 4,
          width: slotWidth - 8,
          height: slotHeight - 8,
        },
        color: selected ? [0.28, 0.24, 0.12] : [0.3, 0.32, 0.34],
      }),
      createPanel({
        id: `hotbar-slot-swatch-${index}`,
        kind: "panel",
        rect: {
          x: slotX + 18,
          y: startY + 20,
          width: 32,
          height: 24,
        },
        color: block.color,
      }),
      createLabel({
        id: `hotbar-slot-key-${index}`,
        kind: "label",
        rect: {
          x: slotX + 6,
          y: startY + 5,
          width: 12,
          height: 12,
        },
        text: String(index + 1),
        scale: 1,
        color: selected ? [0.15, 0.14, 0.08] : [0.96, 0.96, 0.96],
      }),
      createLabel({
        id: `hotbar-slot-count-${index}`,
        kind: "label",
        rect: {
          x: slotX + 6,
          y: startY + 48,
          width: slotWidth - 12,
          height: 12,
        },
        text: `${slot.count}`,
        scale: 1,
        color: slot.count > 0 ? [0.97, 0.97, 0.97] : [0.84, 0.5, 0.5],
        centered: true,
      }),
    );
  });

  return components;
};

const buildBiomeBadge = (
  windowWidth: number,
  windowHeight: number,
  biomeName: string,
): UiResolvedComponent[] => {
  const badgeWidth = 200;
  const badgeHeight = 30;
  const x = Math.round((windowWidth - badgeWidth) / 2);
  const y = windowHeight - 172;

  return [
    createPanel({
      id: "biome-badge-frame",
      kind: "panel",
      rect: { x, y, width: badgeWidth, height: badgeHeight },
      color: [0.12, 0.14, 0.11],
    }),
    createPanel({
      id: "biome-badge-inner",
      kind: "panel",
      rect: { x: x + 3, y: y + 3, width: badgeWidth - 6, height: badgeHeight - 6 },
      color: [0.33, 0.42, 0.24],
    }),
    createLabel({
      id: "biome-badge-label",
      kind: "label",
      rect: { x, y, width: badgeWidth, height: badgeHeight },
      text: `BIOME: ${biomeName}`,
      scale: 2,
      color: [0.95, 0.97, 0.9],
      centered: true,
    }),
  ];
};

const buildModeBadge = (
  windowWidth: number,
  gamemode: PlayerGamemode,
  flying: boolean,
): UiResolvedComponent[] => {
  const badgeWidth = 190;
  const badgeHeight = 28;
  const x = windowWidth - badgeWidth - 20;
  const y = 20;
  const creative = gamemode === 1;
  const text = creative
    ? flying ? "MODE: CREATIVE FLY" : "MODE: CREATIVE"
    : "MODE: NORMAL";

  return [
    createPanel({
      id: "mode-badge-frame",
      kind: "panel",
      rect: { x, y, width: badgeWidth, height: badgeHeight },
      color: creative ? [0.28, 0.2, 0.08] : [0.11, 0.12, 0.14],
    }),
    createPanel({
      id: "mode-badge-inner",
      kind: "panel",
      rect: { x: x + 3, y: y + 3, width: badgeWidth - 6, height: badgeHeight - 6 },
      color: creative ? [0.78, 0.58, 0.16] : [0.25, 0.28, 0.31],
    }),
    createLabel({
      id: "mode-badge-label",
      kind: "label",
      rect: { x, y, width: badgeWidth, height: badgeHeight },
      text,
      scale: 2,
      color: creative ? [0.13, 0.09, 0.02] : [0.95, 0.97, 0.99],
      centered: true,
    }),
  ];
};

const buildChatFeed = (
  windowWidth: number,
  windowHeight: number,
  chatMessages: readonly ChatEntry[],
  chatOpen: boolean,
  nowMs: number,
): UiResolvedComponent[] => {
  const visibleLines = getVisibleChatLines(chatMessages, chatOpen, nowMs);
  if (visibleLines.length === 0) {
    return [];
  }

  const lineWidth = Math.min(CHAT_WIDTH, windowWidth - CHAT_MARGIN_LEFT * 2);
  const totalHeight = visibleLines.length * CHAT_LINE_HEIGHT +
    (visibleLines.length - 1) * CHAT_LINE_GAP;
  const hotbarTop = windowHeight - HOTBAR_SAFE_TOP_OFFSET;
  const feedBottom = chatOpen
    ? hotbarTop - CHAT_GAP_ABOVE_HOTBAR - CHAT_INPUT_HEIGHT - CHAT_FEED_TO_INPUT_GAP
    : hotbarTop - CHAT_GAP_ABOVE_HOTBAR;
  const x = CHAT_MARGIN_LEFT;
  const startY = feedBottom - totalHeight;
  const components: UiResolvedComponent[] = [];

  visibleLines.forEach(({ entry, opacity }, index) => {
    const text = getChatLineText(entry);
    const y = startY + index * (CHAT_LINE_HEIGHT + CHAT_LINE_GAP);
    const backgroundAlpha = (chatOpen ? CHAT_OPEN_LINE_ALPHA : CHAT_CLOSED_LINE_ALPHA) * opacity;
    const textAlpha = (chatOpen ? 1 : 0.94) * opacity;

    components.push(
      createPanel({
        id: `chat-feed-line-bg-${index}`,
        kind: "panel",
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
        kind: "label",
        rect: {
          x: x + 8,
          y,
          width: Math.min(lineWidth - 16, measureTextWidth(text, CHAT_TEXT_SCALE)),
          height: CHAT_LINE_HEIGHT,
        },
        text,
        scale: CHAT_TEXT_SCALE,
        color: entry.kind === "player"
          ? [0.94, 0.95, 0.98, textAlpha]
          : [0.99, 0.88, 0.55, textAlpha],
      }),
    );
  });

  return components;
};

const buildChatInput = (
  windowWidth: number,
  windowHeight: number,
  draft: string,
): UiResolvedComponent[] => {
  const width = Math.min(CHAT_WIDTH, windowWidth - CHAT_MARGIN_LEFT * 2);
  const height = CHAT_INPUT_HEIGHT;
  const x = CHAT_MARGIN_LEFT;
  const y = windowHeight - HOTBAR_SAFE_TOP_OFFSET - CHAT_GAP_ABOVE_HOTBAR - height;
  return [
    createPanel({
      id: "chat-input-frame",
      kind: "panel",
      rect: { x, y, width, height },
      color: [0.05, 0.06, 0.07, CHAT_INPUT_FRAME_ALPHA],
    }),
    createPanel({
      id: "chat-input-inner",
      kind: "panel",
      rect: { x: x + 3, y: y + 3, width: width - 6, height: height - 6 },
      color: [0.1, 0.11, 0.13, CHAT_INPUT_INNER_ALPHA],
    }),
    createLabel({
      id: "chat-input-label",
      kind: "label",
      rect: { x: x + 10, y, width: width - 20, height },
      text: `> ${draft || "_"}`,
      scale: CHAT_TEXT_SCALE,
      color: [0.96, 0.97, 0.99, 1],
    }),
  ];
};

export interface PlayHudState {
  inventory: InventorySnapshot;
  biomeName?: string | null;
  chatMessages?: readonly ChatEntry[];
  chatNowMs?: number;
  chatDraft?: string;
  chatOpen?: boolean;
  gamemode?: PlayerGamemode;
  flying?: boolean;
}

export const buildPlayHud = (
  windowWidth: number,
  windowHeight: number,
  state: PlayHudState,
): UiResolvedComponent[] => [
  ...buildCrosshair(windowWidth, windowHeight),
  ...(state.biomeName ? buildBiomeBadge(windowWidth, windowHeight, state.biomeName) : []),
  ...buildModeBadge(windowWidth, state.gamemode ?? 0, state.flying ?? false),
  ...buildChatFeed(
    windowWidth,
    windowHeight,
    state.chatMessages ?? [],
    state.chatOpen ?? false,
    state.chatNowMs ?? Date.now(),
  ),
  ...(state.chatOpen ? buildChatInput(windowWidth, windowHeight, state.chatDraft ?? "") : []),
  ...buildHotbar(windowWidth, windowHeight, state.inventory),
];
