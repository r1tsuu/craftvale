import type { ChatEntry, InventorySnapshot, PlayerGamemode } from "../types.ts";
import { Blocks } from "../world/blocks.ts";
import { getSelectedInventorySlot } from "../world/inventory.ts";
import {
  createLabel,
  createPanel,
  type UiResolvedComponent,
} from "./components.ts";

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
  windowHeight: number,
  chatMessages: readonly ChatEntry[],
): UiResolvedComponent[] => {
  if (chatMessages.length === 0) {
    return [];
  }

  const visibleMessages = chatMessages.slice(-5);
  const width = 420;
  const lineHeight = 24;
  const height = visibleMessages.length * lineHeight + 20;
  const x = 20;
  const y = windowHeight - 250 - height;
  const components: UiResolvedComponent[] = [
    createPanel({
      id: "chat-feed-frame",
      kind: "panel",
      rect: { x, y, width, height },
      color: [0.07, 0.08, 0.1],
    }),
  ];

  visibleMessages.forEach((entry, index) => {
    const text = entry.kind === "player"
      ? `${entry.senderName ?? "Unknown"}: ${entry.text}`
      : entry.text;
    components.push(
      createLabel({
        id: `chat-feed-line-${index}`,
        kind: "label",
        rect: {
          x: x + 12,
          y: y + 10 + index * lineHeight,
          width: width - 24,
          height: lineHeight - 4,
        },
        text,
        scale: 2,
        color: entry.kind === "player" ? [0.94, 0.95, 0.98] : [0.99, 0.88, 0.55],
      }),
    );
  });

  return components;
};

const buildChatInput = (
  windowHeight: number,
  draft: string,
): UiResolvedComponent[] => {
  const width = 460;
  const height = 34;
  const x = 20;
  const y = windowHeight - 250;
  return [
    createPanel({
      id: "chat-input-frame",
      kind: "panel",
      rect: { x, y, width, height },
      color: [0.07, 0.08, 0.1],
    }),
    createPanel({
      id: "chat-input-inner",
      kind: "panel",
      rect: { x: x + 3, y: y + 3, width: width - 6, height: height - 6 },
      color: [0.2, 0.22, 0.26],
    }),
    createLabel({
      id: "chat-input-label",
      kind: "label",
      rect: { x: x + 10, y: y + 8, width: width - 20, height: 18 },
      text: `> ${draft || "_"}`,
      scale: 2,
      color: [0.96, 0.97, 0.99],
    }),
  ];
};

export interface PlayHudState {
  inventory: InventorySnapshot;
  biomeName?: string | null;
  chatMessages?: readonly ChatEntry[];
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
  ...buildChatFeed(windowHeight, state.chatMessages ?? []),
  ...(state.chatOpen ? buildChatInput(windowHeight, state.chatDraft ?? "") : []),
  ...buildHotbar(windowWidth, windowHeight, state.inventory),
];
