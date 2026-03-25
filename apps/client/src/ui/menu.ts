import type { MenuFocusField, MenuScreen } from "../client/menu-state.ts";
import {
  CLIENT_SETTINGS_LIMITS,
  formatFovSetting,
  formatRenderDistanceSetting,
  formatSensitivitySetting,
} from "../client/client-settings.ts";
import type { WorldSummary } from "@craftvale/core/shared";
import type { ClientSettings, SavedServerRecord } from "../types.ts";
import {
  createButton,
  createLabel,
  createPanel,
  createSlider,
  type UiComponent,
  type UiRect,
} from "./components.ts";
import { centerRect, insetRect, stackX, stackY } from "./layout.ts";

export interface MainMenuViewModel {
  activeScreen: MenuScreen;
  worlds: readonly WorldSummary[];
  selectedWorldName: string | null;
  servers: readonly SavedServerRecord[];
  selectedServerId: string | null;
  createWorldName: string;
  createSeedText: string;
  addServerName: string;
  addServerAddress: string;
  focusedField: MenuFocusField;
  statusText: string;
  busy: boolean;
  settings: ClientSettings;
}

const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

export const buildVoxelBackdrop = (
  width: number,
  height: number,
  seed: number,
): UiComponent[] => {
  const random = createSeededRandom(seed);
  const components: UiComponent[] = [];
  const horizon = Math.round(height * 0.68);
  const blockSize = Math.max(18, Math.round(width / 54));

  components.push(
    createPanel({
      id: "sky-top",
      kind: "panel",
      rect: { x: 0, y: 0, width, height: Math.round(height * 0.36) },
      color: [0.45, 0.74, 0.96],
    }),
    createPanel({
      id: "sky-mid",
      kind: "panel",
      rect: {
        x: 0,
        y: Math.round(height * 0.36),
        width,
        height: Math.round(height * 0.2),
      },
      color: [0.58, 0.82, 0.98],
    }),
    createPanel({
      id: "horizon-band",
      kind: "panel",
      rect: {
        x: 0,
        y: Math.round(height * 0.56),
        width,
        height: Math.round(height * 0.12),
      },
      color: [0.65, 0.86, 0.97],
    }),
    createPanel({
      id: "ground-base",
      kind: "panel",
      rect: { x: 0, y: horizon, width, height: height - horizon },
      color: [0.34, 0.61, 0.22],
    }),
  );

  for (let layer = 0; layer < 3; layer += 1) {
    const bandHeight = Math.round(height * (0.045 + layer * 0.01));
    const y = horizon - bandHeight - layer * 18;
    components.push(
      createPanel({
        id: `ridge-${layer}`,
        kind: "panel",
        rect: { x: 0, y, width, height: bandHeight },
        color:
          layer === 0
            ? [0.28, 0.53, 0.2]
            : layer === 1
              ? [0.24, 0.46, 0.19]
              : [0.21, 0.39, 0.18],
      }),
    );
  }

  for (let x = -blockSize; x < width + blockSize; x += blockSize) {
    const dirtBlocks = 1 + Math.floor(random() * 5);
    const towerChance = random();

    if (towerChance > 0.86) {
      const trunkHeight = 2 + Math.floor(random() * 4);
      for (let block = 0; block < trunkHeight; block += 1) {
        components.push(
          createPanel({
            id: `tree-trunk-${x}-${block}`,
            kind: "panel",
            rect: {
              x,
              y: horizon - (block + 1) * blockSize,
              width: blockSize,
              height: blockSize,
            },
            color: [0.49, 0.35, 0.22],
          }),
        );
      }

      const canopyBaseY = horizon - (trunkHeight + 1) * blockSize;
      for (let canopyX = -1; canopyX <= 1; canopyX += 1) {
        for (let canopyY = 0; canopyY < 2; canopyY += 1) {
          components.push(
            createPanel({
              id: `tree-leaf-${x}-${canopyX}-${canopyY}`,
              kind: "panel",
              rect: {
                x: x + canopyX * blockSize,
                y: canopyBaseY - canopyY * blockSize,
                width: blockSize,
                height: blockSize,
              },
              color: canopyY === 0 ? [0.22, 0.56, 0.18] : [0.25, 0.63, 0.21],
            }),
          );
        }
      }
    }

    for (let dirt = 0; dirt < dirtBlocks; dirt += 1) {
      const isTop = dirt === dirtBlocks - 1;
      components.push(
        createPanel({
          id: `ground-column-${x}-${dirt}`,
          kind: "panel",
          rect: {
            x,
            y: horizon + (4 - dirtBlocks) * Math.floor(blockSize / 2) - dirt * blockSize,
            width: blockSize,
            height: blockSize,
          },
          color: isTop ? [0.38, 0.69, 0.25] : [0.5, 0.36, 0.2],
        }),
      );
    }
  }

  for (let index = 0; index < 8; index += 1) {
    const cloudX = Math.round(random() * (width - 160));
    const cloudY = Math.round(height * (0.08 + random() * 0.22));
    const cloudWidth = 70 + Math.round(random() * 90);
    const cloudHeight = 18 + Math.round(random() * 14);

    components.push(
      createPanel({
        id: `cloud-${index}`,
        kind: "panel",
        rect: {
          x: cloudX,
          y: cloudY,
          width: cloudWidth,
          height: cloudHeight,
        },
        color: [0.94, 0.98, 1],
      }),
    );
  }

  return components;
};

const formatInputValue = (
  label: string,
  value: string,
  focused: boolean,
  placeholder: string,
): string => {
  const content = value || placeholder;
  return `${label}: ${content}${focused ? "_" : ""}`;
};

const formatToggleValue = (enabled: boolean): string => (enabled ? "ON" : "OFF");

const SHELL_SHADOW_SIZE = 10;
const SHELL_FRAME_SIZE = 4;
const SHELL_PADDING = {
  top: 26,
  right: 36,
  bottom: 28,
  left: 36,
};
const SHELL_HEADER_GAP = 2;
const SHELL_SECTION_GAP = 24;
const SHELL_STATUS_HEIGHT = 38;
const SHELL_FOOTER_GAP = 18;
const STATUS_BAR_PADDING_X = 14;

interface ScreenShell {
  panelRect: UiRect;
  contentRect: UiRect;
  bodyRect: UiRect;
  footerRect: UiRect;
  panelX: number;
  panelY: number;
  components: UiComponent[];
}

interface ShellPalette {
  shadow: readonly [number, number, number, number?];
  frame: readonly [number, number, number, number?];
  panel: readonly [number, number, number, number?];
  title: readonly [number, number, number, number?];
  subtitle: readonly [number, number, number, number?];
}

const DEFAULT_SHELL_PALETTE: ShellPalette = {
  shadow: [0.08, 0.09, 0.1],
  frame: [0.22, 0.23, 0.24],
  panel: [0.16, 0.18, 0.2],
  title: [0.98, 0.98, 0.98],
  subtitle: [0.82, 0.86, 0.89],
};

const buildFramedPanel = (
  idPrefix: string,
  panelRect: UiRect,
  palette: ShellPalette,
): UiComponent[] => [
  createPanel({
    id: `${idPrefix}-shadow`,
    kind: "panel",
    rect: {
      x: panelRect.x - SHELL_SHADOW_SIZE,
      y: panelRect.y - SHELL_SHADOW_SIZE,
      width: panelRect.width + SHELL_SHADOW_SIZE * 2,
      height: panelRect.height + SHELL_SHADOW_SIZE * 2,
    },
    color: palette.shadow,
  }),
  createPanel({
    id: `${idPrefix}-frame`,
    kind: "panel",
    rect: {
      x: panelRect.x - SHELL_FRAME_SIZE,
      y: panelRect.y - SHELL_FRAME_SIZE,
      width: panelRect.width + SHELL_FRAME_SIZE * 2,
      height: panelRect.height + SHELL_FRAME_SIZE * 2,
    },
    color: palette.frame,
  }),
  createPanel({
    id: `${idPrefix}-panel`,
    kind: "panel",
    rect: panelRect,
    color: palette.panel,
  }),
];

const buildMenuShell = (
  width: number,
  height: number,
  title: string,
  subtitle: string,
  seed: number,
  panelWidth: number,
  panelHeight: number,
  options?: {
    idPrefix?: string;
    backgroundComponents?: UiComponent[];
    footerHeight?: number;
    palette?: ShellPalette;
  },
): ScreenShell => {
  const idPrefix = options?.idPrefix ?? "menu";
  const footerHeight = options?.footerHeight ?? SHELL_STATUS_HEIGHT;
  const palette = options?.palette ?? DEFAULT_SHELL_PALETTE;
  const viewportRect = { x: 0, y: 0, width, height };
  const panelRect = centerRect(viewportRect, panelWidth, panelHeight);
  const contentRect = insetRect(panelRect, SHELL_PADDING);
  const [titleRect, subtitleRect] = stackY(
    {
      x: contentRect.x,
      y: contentRect.y,
      width: contentRect.width,
      height: 58 + SHELL_HEADER_GAP + 30,
    },
    [
      { height: 58 },
      { height: 30 },
    ],
    SHELL_HEADER_GAP,
  );
  const footerRect = {
    x: contentRect.x,
    y: panelRect.y + panelRect.height - SHELL_PADDING.bottom - footerHeight,
    width: contentRect.width,
    height: footerHeight,
  };
  const bodyTop = subtitleRect.y + subtitleRect.height + SHELL_SECTION_GAP;
  const bodyBottom = footerHeight > 0
    ? footerRect.y - SHELL_FOOTER_GAP
    : panelRect.y + panelRect.height - SHELL_PADDING.bottom;
  const bodyRect = {
    x: contentRect.x,
    y: bodyTop,
    width: contentRect.width,
    height: Math.max(0, bodyBottom - bodyTop),
  };

  return {
    panelRect,
    contentRect,
    bodyRect,
    footerRect,
    panelX: panelRect.x,
    panelY: panelRect.y,
    components: [
      ...(options?.backgroundComponents ?? buildVoxelBackdrop(width, height, seed)),
      ...buildFramedPanel(idPrefix, panelRect, palette),
      createLabel({
        id: `${idPrefix}-title`,
        kind: "label",
        rect: titleRect,
        text: title,
        scale: 5,
        color: palette.title,
        centered: true,
      }),
      createLabel({
        id: `${idPrefix}-subtitle`,
        kind: "label",
        rect: subtitleRect,
        text: subtitle,
        scale: 2,
        color: palette.subtitle,
        centered: true,
      }),
    ],
  };
};

const buildStatusBar = (
  idPrefix: string,
  rect: UiRect,
  text: string,
  busy: boolean,
  centered = true,
): UiComponent[] => {
  if (!text) {
    return [];
  }

  const innerRect = insetRect(rect, 2);
  const accentColor: readonly [number, number, number] = busy
    ? [0.56, 0.46, 0.15]
    : [0.2, 0.35, 0.48];

  return [
    createPanel({
      id: `${idPrefix}-status-frame`,
      kind: "panel",
      rect,
      color: [0.11, 0.12, 0.13, 0.95],
    }),
    createPanel({
      id: `${idPrefix}-status-panel`,
      kind: "panel",
      rect: innerRect,
      color: [0.2, 0.22, 0.24, 0.96],
    }),
    createPanel({
      id: `${idPrefix}-status-accent`,
      kind: "panel",
      rect: {
        x: innerRect.x,
        y: innerRect.y,
        width: 6,
        height: innerRect.height,
      },
      color: accentColor,
    }),
    createLabel({
      id: `${idPrefix}-status-label`,
      kind: "label",
      rect: insetRect(innerRect, {
        top: 8,
        right: STATUS_BAR_PADDING_X,
        bottom: 8,
        left: STATUS_BAR_PADDING_X + 8,
      }),
      text,
      scale: 2,
      color: busy ? [0.96, 0.86, 0.56] : [0.88, 0.91, 0.94],
      centered,
    }),
  ];
};

const buildPlayMenu = (
  width: number,
  height: number,
  viewModel: MainMenuViewModel,
  seed: number,
): UiComponent[] => {
  const panelWidth = 620;
  const panelHeight = 560;
  const shell = buildMenuShell(
    width,
    height,
    "CRAFTVALE",
    "Local worlds and dedicated multiplayer",
    seed,
    panelWidth,
    panelHeight,
  );
  const [labelRect, ...buttonRects] = stackY(
    insetRect(shell.bodyRect, {
      top: 6,
      left: 28,
      right: 28,
    }),
    [
      { width: shell.bodyRect.width - 56, height: 34 },
      { width: 320, height: 56 },
      { width: 320, height: 56 },
      { width: 320, height: 56 },
      { width: 320, height: 56 },
    ],
    18,
    "center",
  );

  return [
    ...shell.components,
    createLabel({
      id: "play-screen-label",
      kind: "label",
      rect: labelRect,
      text: "CHOOSE SINGLEPLAYER OR MULTIPLAYER",
      scale: 2,
      color: [0.9, 0.92, 0.95],
      centered: true,
    }),
    createButton({
      id: "singleplayer-button",
      kind: "button",
      rect: buttonRects[0],
      text: "SINGLEPLAYER",
      action: "open-worlds",
      scale: 3,
      variant: "primary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "multiplayer-button",
      kind: "button",
      rect: buttonRects[1],
      text: "MULTIPLAYER",
      action: "open-multiplayer",
      scale: 3,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "settings-button",
      kind: "button",
      rect: buttonRects[2],
      text: "SETTINGS",
      action: "open-settings",
      scale: 3,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "quit-button",
      kind: "button",
      rect: buttonRects[3],
      text: "QUIT GAME",
      action: "quit-game",
      scale: 3,
      variant: "secondary",
    }),
    ...buildStatusBar("menu", shell.footerRect, viewModel.statusText, viewModel.busy),
  ];
};

const buildWorldList = (
  viewModel: MainMenuViewModel,
  listRect: UiRect,
): UiComponent[] => {
  const visibleWorlds = viewModel.worlds.slice(0, 6);
  const itemArea = insetRect(listRect, {
    top: 56,
    right: 22,
    bottom: 20,
    left: 22,
  });
  const rowRects = stackY(
    itemArea,
    visibleWorlds.map(() => ({
      height: 48,
    })),
    12,
  );

  if (visibleWorlds.length === 0) {
    return [
      createLabel({
        id: "world-empty",
        kind: "label",
        rect: {
          x: listRect.x + 30,
          y: listRect.y + 92,
          width: listRect.width - 60,
          height: 40,
        },
        text: "NO WORLDS YET",
        scale: 3,
        color: [0.82, 0.88, 0.92],
        centered: true,
      }),
      createLabel({
        id: "world-empty-hint",
        kind: "label",
        rect: {
          x: listRect.x + 30,
          y: listRect.y + 136,
          width: listRect.width - 60,
          height: 26,
        },
        text: "CREATE ONE TO START PLAYING",
        scale: 2,
        color: [0.78, 0.82, 0.86],
        centered: true,
      }),
    ];
  }

  return visibleWorlds.map((world, index) => {
    const selected = world.name === viewModel.selectedWorldName;
    return createButton({
      id: `world-${index}`,
      kind: "button",
      rect: rowRects[index]!,
      text: `${selected ? "> " : ""}${world.name}   SEED ${world.seed}`,
      action: `select-world:${world.name}`,
      scale: 2,
      variant: selected ? "primary" : "secondary",
      disabled: viewModel.busy,
    });
  });
};

const buildWorldsMenu = (
  width: number,
  height: number,
  viewModel: MainMenuViewModel,
  seed: number,
): UiComponent[] => {
  const panelWidth = 980;
  const panelHeight = 650;
  const shell = buildMenuShell(
    width,
    height,
    "SINGLEPLAYER WORLDS",
    "Click a world to focus it, or create a new one",
    seed,
    panelWidth,
    panelHeight,
  );
  const [listRect, sideRect] = stackX(
    shell.bodyRect,
    [
      { width: 540 },
      {},
    ],
    32,
  );
  const sideContentRect = insetRect(sideRect, 20);
  const [selectionTitleRect, selectionNameRect, selectionSeedRect, joinRect, createRect, utilityRowRect] = stackY(
    {
      x: sideContentRect.x,
      y: sideContentRect.y,
      width: sideContentRect.width,
      height: sideContentRect.height,
    },
    [
      { height: 24 },
      { height: 44 },
      { height: 24 },
      { height: 52 },
      { height: 52 },
      { height: 52 },
    ],
    10,
  );
  const [refreshRect, deleteRect] = stackX(utilityRowRect, [{}, {}], 16);
  const [backRect, statusRect] = stackX(shell.footerRect, [{ width: 200 }, {}], 18);
  const selectedWorld = viewModel.worlds.find((world) => world.name === viewModel.selectedWorldName) ?? null;

  return [
    ...shell.components,
    createPanel({
      id: "world-list-frame",
      kind: "panel",
      rect: listRect,
      color: [0.11, 0.12, 0.13],
    }),
    createPanel({
      id: "world-list-panel",
      kind: "panel",
      rect: insetRect(listRect, 4),
      color: [0.24, 0.26, 0.28],
    }),
    createLabel({
      id: "world-list-title",
      kind: "label",
      rect: {
        x: listRect.x + 22,
        y: listRect.y + 18,
        width: listRect.width - 44,
        height: 24,
      },
      text: "YOUR WORLDS",
      scale: 3,
      color: [0.94, 0.95, 0.96],
      centered: false,
    }),
    ...buildWorldList(viewModel, listRect),
    createPanel({
      id: "world-side-panel",
      kind: "panel",
      rect: sideRect,
      color: [0.19, 0.2, 0.22],
    }),
    createLabel({
      id: "world-selection-title",
      kind: "label",
      rect: selectionTitleRect,
      text: "FOCUSED WORLD",
      scale: 3,
      color: [0.94, 0.95, 0.96],
      centered: true,
    }),
    createLabel({
      id: "world-selection-name",
      kind: "label",
      rect: selectionNameRect,
      text: selectedWorld?.name ?? "CLICK A WORLD",
      scale: 3,
      color: selectedWorld ? [0.98, 0.95, 0.76] : [0.8, 0.84, 0.88],
      centered: true,
    }),
    createLabel({
      id: "world-selection-seed",
      kind: "label",
      rect: selectionSeedRect,
      text: selectedWorld ? `SEED ${selectedWorld.seed}` : "FOCUS ONE WITH A MOUSE CLICK",
      scale: 2,
      color: [0.84, 0.88, 0.91],
      centered: true,
    }),
    createButton({
      id: "join-button",
      kind: "button",
      rect: joinRect,
      text: viewModel.busy ? "JOINING..." : "PLAY SELECTED WORLD",
      action: "join-world",
      scale: 2,
      variant: "primary",
      disabled: viewModel.busy || selectedWorld === null,
    }),
    createButton({
      id: "create-button",
      kind: "button",
      rect: createRect,
      text: "CREATE WORLD",
      action: "open-create-world",
      scale: 3,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "refresh-button",
      kind: "button",
      rect: refreshRect,
      text: "REFRESH",
      action: "refresh-worlds",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "delete-button",
      kind: "button",
      rect: deleteRect,
      text: "DELETE",
      action: "delete-world",
      scale: 2,
      variant: "danger",
      disabled: viewModel.busy || selectedWorld === null,
    }),
    createButton({
      id: "back-button",
      kind: "button",
      rect: backRect,
      text: "BACK",
      action: "back-to-play",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    ...buildStatusBar("menu", statusRect, viewModel.statusText, viewModel.busy, false),
  ];
};

const buildServerList = (
  viewModel: MainMenuViewModel,
  listRect: UiRect,
): UiComponent[] => {
  const visibleServers = viewModel.servers.slice(0, 6);
  const itemArea = insetRect(listRect, {
    top: 56,
    right: 22,
    bottom: 20,
    left: 22,
  });
  const rowRects = stackY(
    itemArea,
    visibleServers.map(() => ({
      height: 48,
    })),
    12,
  );

  if (visibleServers.length === 0) {
    return [
      createLabel({
        id: "server-empty",
        kind: "label",
        rect: {
          x: listRect.x + 30,
          y: listRect.y + 92,
          width: listRect.width - 60,
          height: 40,
        },
        text: "NO SAVED SERVERS",
        scale: 3,
        color: [0.82, 0.88, 0.92],
        centered: true,
      }),
      createLabel({
        id: "server-empty-hint",
        kind: "label",
        rect: {
          x: listRect.x + 30,
          y: listRect.y + 136,
          width: listRect.width - 60,
          height: 26,
        },
        text: "ADD ONE TO START PLAYING ONLINE",
        scale: 2,
        color: [0.78, 0.82, 0.86],
        centered: true,
      }),
    ];
  }

  return visibleServers.flatMap((server, index) => {
    const selected = server.id === viewModel.selectedServerId;
    const rowRect = rowRects[index]!;
    const [mainRect, deleteRect] = stackX(rowRect, [{}, { width: 70 }], 14);
    return [
      createButton({
        id: `server-${index}`,
        kind: "button",
        rect: mainRect,
        text: `${selected ? "> " : ""}${server.name}   ${server.address}`,
        action: `select-server:${server.id}`,
        scale: 2,
        variant: selected ? "primary" : "secondary",
        disabled: viewModel.busy,
      }),
      createButton({
        id: `server-delete-${index}`,
        kind: "button",
        rect: deleteRect,
        text: "X",
        action: `delete-server:${server.id}`,
        scale: 3,
        variant: "danger",
        disabled: viewModel.busy,
      }),
    ];
  });
};

const buildMultiplayerMenu = (
  width: number,
  height: number,
  viewModel: MainMenuViewModel,
  seed: number,
): UiComponent[] => {
  const panelWidth = 980;
  const panelHeight = 650;
  const shell = buildMenuShell(
    width,
    height,
    "MULTIPLAYER",
    "Select a saved server or add a new one",
    seed,
    panelWidth,
    panelHeight,
  );
  const [listRect, sideRect] = stackX(
    shell.bodyRect,
    [
      { width: 540 },
      {},
    ],
    32,
  );
  const sideContentRect = insetRect(sideRect, 20);
  const [selectionTitleRect, selectionNameRect, selectionAddressRect, joinRect, addRect] = stackY(
    sideContentRect,
    [
      { height: 24 },
      { height: 44 },
      { height: 24 },
      { height: 52 },
      { height: 52 },
    ],
    20,
  );
  const [backRect, statusRect] = stackX(shell.footerRect, [{ width: 200 }, {}], 18);
  const selectedServer = viewModel.servers.find((server) => server.id === viewModel.selectedServerId) ?? null;

  return [
    ...shell.components,
    createPanel({
      id: "server-list-frame",
      kind: "panel",
      rect: listRect,
      color: [0.11, 0.12, 0.13],
    }),
    createPanel({
      id: "server-list-panel",
      kind: "panel",
      rect: insetRect(listRect, 4),
      color: [0.24, 0.26, 0.28],
    }),
    createLabel({
      id: "server-list-title",
      kind: "label",
      rect: {
        x: listRect.x + 22,
        y: listRect.y + 18,
        width: listRect.width - 44,
        height: 24,
      },
      text: "SAVED SERVERS",
      scale: 3,
      color: [0.94, 0.95, 0.96],
      centered: false,
    }),
    ...buildServerList(viewModel, listRect),
    createPanel({
      id: "server-side-panel",
      kind: "panel",
      rect: sideRect,
      color: [0.19, 0.2, 0.22],
    }),
    createLabel({
      id: "server-selection-title",
      kind: "label",
      rect: selectionTitleRect,
      text: "SELECTED SERVER",
      scale: 3,
      color: [0.94, 0.95, 0.96],
      centered: true,
    }),
    createLabel({
      id: "server-selection-name",
      kind: "label",
      rect: selectionNameRect,
      text: selectedServer?.name ?? "CLICK A SERVER",
      scale: 3,
      color: selectedServer ? [0.98, 0.95, 0.76] : [0.8, 0.84, 0.88],
      centered: true,
    }),
    createLabel({
      id: "server-selection-address",
      kind: "label",
      rect: selectionAddressRect,
      text: selectedServer?.address ?? "SELECT ONE FROM THE LEFT",
      scale: 2,
      color: [0.84, 0.88, 0.91],
      centered: true,
    }),
    createButton({
      id: "join-server-button",
      kind: "button",
      rect: joinRect,
      text: viewModel.busy ? "CONNECTING..." : "JOIN SERVER",
      action: "join-server",
      scale: 3,
      variant: "primary",
      disabled: viewModel.busy || selectedServer === null,
    }),
    createButton({
      id: "open-add-server-button",
      kind: "button",
      rect: addRect,
      text: "ADD SERVER",
      action: "open-add-server",
      scale: 3,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "multiplayer-back-button",
      kind: "button",
      rect: backRect,
      text: "BACK",
      action: "back-to-play",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    ...buildStatusBar("multiplayer", statusRect, viewModel.statusText, viewModel.busy, false),
  ];
};

const buildCreateWorldMenu = (
  width: number,
  height: number,
  viewModel: MainMenuViewModel,
  seed: number,
): UiComponent[] => {
  const panelWidth = 760;
  const panelHeight = 500;
  const shell = buildMenuShell(
    width,
    height,
    "CREATE NEW WORLD",
    "Set a name and optional numeric seed",
    seed,
    panelWidth,
    panelHeight,
  );
  const contentRect = insetRect(shell.bodyRect, {
    left: 76,
    right: 76,
  });
  const [hintRect, nameRect, seedRect, actionsRect] = stackY(
    contentRect,
    [
      { height: 28 },
      { height: 60 },
      { height: 60 },
      { height: 54 },
    ],
    18,
  );
  const [confirmRect, cancelRect] = stackX(actionsRect, [{}, {}], 20);

  return [
    ...shell.components,
    createLabel({
      id: "create-world-hint",
      kind: "label",
      rect: hintRect,
      text: "PRESS TAB TO SWITCH FIELDS",
      scale: 2,
      color: [0.86, 0.9, 0.94],
      centered: true,
    }),
    createButton({
      id: "name-input",
      kind: "button",
      rect: nameRect,
      text: formatInputValue(
        "NAME",
        viewModel.createWorldName,
        viewModel.focusedField === "world-name",
        "TYPE A NAME",
      ),
      action: "focus-world-name",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "seed-input",
      kind: "button",
      rect: seedRect,
      text: formatInputValue(
        "SEED",
        viewModel.createSeedText,
        viewModel.focusedField === "world-seed",
        "BLANK = RANDOM",
      ),
      action: "focus-world-seed",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "confirm-create-button",
      kind: "button",
      rect: confirmRect,
      text: viewModel.busy ? "CREATING..." : "CREATE WORLD",
      action: "create-world",
      scale: 3,
      variant: "primary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "cancel-create-button",
      kind: "button",
      rect: cancelRect,
      text: "CANCEL",
      action: "back-to-worlds",
      scale: 3,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    ...buildStatusBar("menu", shell.footerRect, viewModel.statusText, viewModel.busy),
  ];
};

const buildAddServerMenu = (
  width: number,
  height: number,
  viewModel: MainMenuViewModel,
  seed: number,
): UiComponent[] => {
  const panelWidth = 760;
  const panelHeight = 500;
  const shell = buildMenuShell(
    width,
    height,
    "ADD SERVER",
    "Set a display name and server address",
    seed,
    panelWidth,
    panelHeight,
  );
  const contentRect = insetRect(shell.bodyRect, {
    left: 76,
    right: 76,
  });
  const [hintRect, nameRect, addressRect, actionsRect] = stackY(
    contentRect,
    [
      { height: 28 },
      { height: 60 },
      { height: 60 },
      { height: 54 },
    ],
    18,
  );
  const [confirmRect, cancelRect] = stackX(actionsRect, [{}, {}], 20);

  return [
    ...shell.components,
    createLabel({
      id: "add-server-hint",
      kind: "label",
      rect: hintRect,
      text: "PRESS TAB TO SWITCH FIELDS",
      scale: 2,
      color: [0.86, 0.9, 0.94],
      centered: true,
    }),
    createButton({
      id: "server-name-input",
      kind: "button",
      rect: nameRect,
      text: formatInputValue(
        "NAME",
        viewModel.addServerName,
        viewModel.focusedField === "server-name",
        "LOCAL SERVER",
      ),
      action: "focus-server-name",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "server-address-input",
      kind: "button",
      rect: addressRect,
      text: formatInputValue(
        "ADDRESS",
        viewModel.addServerAddress,
        viewModel.focusedField === "server-address",
        "127.0.0.1:3210",
      ),
      action: "focus-server-address",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "confirm-add-server-button",
      kind: "button",
      rect: confirmRect,
      text: viewModel.busy ? "SAVING..." : "ADD SERVER",
      action: "save-server",
      scale: 3,
      variant: "primary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "cancel-add-server-button",
      kind: "button",
      rect: cancelRect,
      text: "CANCEL",
      action: "back-to-multiplayer",
      scale: 3,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    ...buildStatusBar("add-server", shell.footerRect, viewModel.statusText, viewModel.busy),
  ];
};

export interface SettingsPanelViewModel {
  settings: ClientSettings;
  statusText: string;
  busy: boolean;
}

interface SettingsPanelOptions {
  bodyRect: UiRect;
  footerRect: UiRect;
  viewModel: SettingsPanelViewModel;
  backAction: string;
  idPrefix?: string;
}

const buildSettingsPanelContents = ({
  bodyRect,
  footerRect,
  viewModel,
  backAction,
  idPrefix = "settings",
}: SettingsPanelOptions): UiComponent[] => {
  const bodyContentRect = insetRect(bodyRect, {
    left: 36,
    right: 36,
    top: 4,
  });
  const sliderWidth = 420;
  const valueLabelWidth = 150;
  const rowHeight = 58;
  const sliderX = bodyContentRect.x + 178;
  const valueX = bodyContentRect.x + bodyContentRect.width - valueLabelWidth;
  const [
    gameplayTitleRect,
    fovRowRect,
    sensitivityRowRect,
    renderDistanceRowRect,
    graphicsTitleRect,
    toggleRowRect,
    actionRowRect,
  ] = stackY(
    bodyContentRect,
    [
      { height: 24 },
      { height: 48 },
      { height: 48 },
      { height: 48 },
      { height: 24 },
      { height: rowHeight },
      { height: 50 },
    ],
    12,
  );

  const sliderRows = [
    {
      id: `${idPrefix}-fov`,
      title: "FOV",
      value: viewModel.settings.fovDegrees,
      text: formatFovSetting(viewModel.settings.fovDegrees),
      min: CLIENT_SETTINGS_LIMITS.fovDegrees.min,
      max: CLIENT_SETTINGS_LIMITS.fovDegrees.max,
      step: CLIENT_SETTINGS_LIMITS.fovDegrees.step,
      action: "set-setting:fovDegrees",
      rect: fovRowRect,
    },
    {
      id: `${idPrefix}-sensitivity`,
      title: "SENSITIVITY",
      value: viewModel.settings.mouseSensitivity,
      text: formatSensitivitySetting(viewModel.settings.mouseSensitivity),
      min: CLIENT_SETTINGS_LIMITS.mouseSensitivity.min,
      max: CLIENT_SETTINGS_LIMITS.mouseSensitivity.max,
      step: CLIENT_SETTINGS_LIMITS.mouseSensitivity.step,
      action: "set-setting:mouseSensitivity",
      rect: sensitivityRowRect,
    },
    {
      id: `${idPrefix}-render-distance`,
      title: "RENDER DISTANCE",
      value: viewModel.settings.renderDistance,
      text: formatRenderDistanceSetting(viewModel.settings.renderDistance),
      min: CLIENT_SETTINGS_LIMITS.renderDistance.min,
      max: CLIENT_SETTINGS_LIMITS.renderDistance.max,
      step: CLIENT_SETTINGS_LIMITS.renderDistance.step,
      action: "set-setting:renderDistance",
      rect: renderDistanceRowRect,
    },
  ] as const;

  const sliderComponents = sliderRows.flatMap((row) => [
    createLabel({
      id: `${row.id}-label`,
      kind: "label",
      rect: {
        x: bodyContentRect.x,
        y: row.rect.y + 2,
        width: 170,
        height: 24,
      },
      text: row.title,
      scale: 3,
      color: [0.96, 0.97, 0.98],
      centered: false,
    }),
    createLabel({
      id: `${row.id}-value`,
      kind: "label",
      rect: {
        x: valueX,
        y: row.rect.y + 2,
        width: valueLabelWidth,
        height: 24,
      },
      text: row.text,
      scale: 2,
      color: [0.93, 0.95, 0.87],
      centered: true,
    }),
    createSlider({
      id: `${row.id}-slider`,
      kind: "slider",
      rect: {
        x: sliderX,
        y: row.rect.y + 26,
        width: sliderWidth,
        height: 22,
      },
      action: row.action,
      value: row.value,
      min: row.min,
      max: row.max,
      step: row.step,
      disabled: viewModel.busy,
    }),
  ]);
  const [debugRect, crosshairRect] = stackX(toggleRowRect, [{}, {}], 20);
  const [resetRect, backRect] = stackX(actionRowRect, [{ width: 244 }, { width: 244 }], bodyContentRect.width - 488);

  return [
    createLabel({
      id: `${idPrefix}-gameplay-title`,
      kind: "label",
      rect: gameplayTitleRect,
      text: "GAMEPLAY",
      scale: 3,
      color: [0.98, 0.95, 0.76],
      centered: false,
    }),
    ...sliderComponents,
    createLabel({
      id: `${idPrefix}-graphics-title`,
      kind: "label",
      rect: graphicsTitleRect,
      text: "GRAPHICS",
      scale: 3,
      color: [0.98, 0.95, 0.76],
      centered: false,
    }),
    createButton({
      id: `${idPrefix}-debug-toggle`,
      kind: "button",
      rect: debugRect,
      text: `DEBUG INFO: ${formatToggleValue(viewModel.settings.showDebugOverlay)}`,
      action: "toggle-setting:showDebugOverlay",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: `${idPrefix}-crosshair-toggle`,
      kind: "button",
      rect: crosshairRect,
      text: `CROSSHAIR: ${formatToggleValue(viewModel.settings.showCrosshair)}`,
      action: "toggle-setting:showCrosshair",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: `${idPrefix}-reset`,
      kind: "button",
      rect: resetRect,
      text: "RESET DEFAULTS",
      action: "reset-settings",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: `${idPrefix}-back`,
      kind: "button",
      rect: backRect,
      text: "BACK",
      action: backAction,
      scale: 3,
      variant: "primary",
      disabled: viewModel.busy,
    }),
    ...buildStatusBar(idPrefix, footerRect, viewModel.statusText, viewModel.busy),
  ];
};

const buildSettingsMenu = (
  width: number,
  height: number,
  viewModel: MainMenuViewModel,
  seed: number,
): UiComponent[] => {
  const panelWidth = 860;
  const panelHeight = 620;
  const shell = buildMenuShell(
    width,
    height,
    "SETTINGS",
    "Adjust camera, controls, and lightweight graphics options",
    seed,
    panelWidth,
    panelHeight,
  );

  return [
    ...shell.components,
    ...buildSettingsPanelContents({
      bodyRect: shell.bodyRect,
      footerRect: shell.footerRect,
      viewModel,
      backAction: "back-to-play",
    }),
  ];
};

export const buildPauseMenuOverlay = (
  width: number,
  height: number,
): UiComponent[] => {
  const panelWidth = 420;
  const panelHeight = 380;
  const shell = buildMenuShell(
    width,
    height,
    "GAME PAUSED",
    "Esc or Back to Game to resume",
    0,
    panelWidth,
    panelHeight,
    {
      idPrefix: "pause",
      footerHeight: 0,
      backgroundComponents: [
        createPanel({
          id: "pause-dim",
          kind: "panel",
          rect: { x: 0, y: 0, width, height },
          color: [0.03, 0.04, 0.05, 0.58],
        }),
      ],
      palette: {
        shadow: [0.08, 0.09, 0.1, 0.82],
        frame: [0.22, 0.23, 0.24, 0.96],
        panel: [0.16, 0.18, 0.2, 0.97],
        title: [0.98, 0.98, 0.98],
        subtitle: [0.82, 0.86, 0.89],
      },
    },
  );
  const buttonRects = stackY(
    insetRect(shell.bodyRect, {
      top: 8,
    }),
    [
      { width: 280, height: 52 },
      { width: 280, height: 52 },
      { width: 280, height: 52 },
    ],
    18,
    "center",
  );

  return [
    ...shell.components,
    createButton({
      id: "pause-resume-button",
      kind: "button",
      rect: buttonRects[0]!,
      text: "BACK TO GAME",
      action: "pause-back-to-game",
      scale: 3,
      variant: "primary",
    }),
    createButton({
      id: "pause-settings-button",
      kind: "button",
      rect: buttonRects[1]!,
      text: "SETTINGS",
      action: "pause-open-settings",
      scale: 3,
      variant: "secondary",
    }),
    createButton({
      id: "pause-exit-button",
      kind: "button",
      rect: buttonRects[2]!,
      text: "EXIT TO MENU",
      action: "pause-exit-to-menu",
      scale: 3,
      variant: "secondary",
    }),
  ];
};

export const buildPauseSettingsOverlay = (
  width: number,
  height: number,
  viewModel: SettingsPanelViewModel,
): UiComponent[] => {
  const panelWidth = 860;
  const panelHeight = 620;
  const shell = buildMenuShell(
    width,
    height,
    "SETTINGS",
    "Adjust settings without leaving your world",
    0,
    panelWidth,
    panelHeight,
    {
      idPrefix: "pause-settings",
      backgroundComponents: [
        createPanel({
          id: "pause-settings-dim",
          kind: "panel",
          rect: { x: 0, y: 0, width, height },
          color: [0.03, 0.04, 0.05, 0.62],
        }),
      ],
      palette: {
        shadow: [0.07, 0.08, 0.1, 0.84],
        frame: [0.22, 0.23, 0.24, 0.96],
        panel: [0.16, 0.18, 0.2, 0.97],
        title: [0.98, 0.98, 0.98],
        subtitle: [0.82, 0.86, 0.89],
      },
    },
  );

  return [
    ...shell.components,
    ...buildSettingsPanelContents({
      bodyRect: shell.bodyRect,
      footerRect: shell.footerRect,
      viewModel,
      backAction: "back-to-pause",
      idPrefix: "pause-settings",
    }),
  ];
};

export const buildMainMenu = (
  width: number,
  height: number,
  viewModel: MainMenuViewModel,
  seed = 1337,
): UiComponent[] => {
  if (viewModel.activeScreen === "settings") {
    return buildSettingsMenu(width, height, viewModel, seed);
  }

  if (viewModel.activeScreen === "multiplayer") {
    return buildMultiplayerMenu(width, height, viewModel, seed);
  }

  if (viewModel.activeScreen === "add-server") {
    return buildAddServerMenu(width, height, viewModel, seed);
  }

  if (viewModel.activeScreen === "worlds") {
    return buildWorldsMenu(width, height, viewModel, seed);
  }

  if (viewModel.activeScreen === "create-world") {
    return buildCreateWorldMenu(width, height, viewModel, seed);
  }

  return buildPlayMenu(width, height, viewModel, seed);
};
