import type { MenuFocusField, MenuScreen } from "../client/menu-state.ts";
import {
  CLIENT_SETTINGS_LIMITS,
  formatFovSetting,
  formatRenderDistanceSetting,
  formatSensitivitySetting,
} from "../client/client-settings.ts";
import type { WorldSummary } from "../shared/messages.ts";
import type { ClientSettings } from "../types.ts";
import {
  createButton,
  createLabel,
  createPanel,
  createSlider,
  type UiComponent,
} from "./components.ts";

export interface MainMenuViewModel {
  activeScreen: MenuScreen;
  worlds: readonly WorldSummary[];
  selectedWorldName: string | null;
  createWorldName: string;
  createSeedText: string;
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

const buildVoxelBackdrop = (
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

const buildMenuShell = (
  width: number,
  height: number,
  title: string,
  subtitle: string,
  seed: number,
  panelWidth: number,
  panelHeight: number,
): {
  components: UiComponent[];
  panelX: number;
  panelY: number;
} => {
  const panelX = Math.round((width - panelWidth) / 2);
  const panelY = Math.round((height - panelHeight) / 2);

  return {
    panelX,
    panelY,
    components: [
      ...buildVoxelBackdrop(width, height, seed),
      createPanel({
        id: "menu-shadow",
        kind: "panel",
        rect: {
          x: panelX - 10,
          y: panelY - 10,
          width: panelWidth + 20,
          height: panelHeight + 20,
        },
        color: [0.08, 0.09, 0.1],
      }),
      createPanel({
        id: "menu-frame",
        kind: "panel",
        rect: {
          x: panelX - 4,
          y: panelY - 4,
          width: panelWidth + 8,
          height: panelHeight + 8,
        },
        color: [0.22, 0.23, 0.24],
      }),
      createPanel({
        id: "menu-panel",
        kind: "panel",
        rect: {
          x: panelX,
          y: panelY,
          width: panelWidth,
          height: panelHeight,
        },
        color: [0.16, 0.18, 0.2],
      }),
      createLabel({
        id: "menu-title",
        kind: "label",
        rect: {
          x: panelX + 30,
          y: panelY + 26,
          width: panelWidth - 60,
          height: 58,
        },
        text: title,
        scale: 5,
        color: [0.98, 0.98, 0.98],
        centered: true,
      }),
      createLabel({
        id: "menu-subtitle",
        kind: "label",
        rect: {
          x: panelX + 30,
          y: panelY + 86,
          width: panelWidth - 60,
          height: 30,
        },
        text: subtitle,
        scale: 2,
        color: [0.82, 0.86, 0.89],
        centered: true,
      }),
    ],
  };
};

const buildPlayMenu = (
  width: number,
  height: number,
  viewModel: MainMenuViewModel,
  seed: number,
): UiComponent[] => {
  const panelWidth = 620;
  const panelHeight = 460;
  const shell = buildMenuShell(
    width,
    height,
    "MINECRAFT CLONE",
    "A worker-backed voxel sandbox",
    seed,
    panelWidth,
    panelHeight,
  );
  const buttonWidth = 320;
  const buttonHeight = 56;
  const buttonX = shell.panelX + Math.round((panelWidth - buttonWidth) / 2);

  return [
    ...shell.components,
    createLabel({
      id: "play-screen-label",
      kind: "label",
      rect: {
        x: shell.panelX + 70,
        y: shell.panelY + 140,
        width: panelWidth - 140,
        height: 34,
      },
      text: "SELECT PLAY TO OPEN YOUR WORLDS",
      scale: 2,
      color: [0.9, 0.92, 0.95],
      centered: true,
    }),
    createButton({
      id: "play-button",
      kind: "button",
      rect: {
        x: buttonX,
        y: shell.panelY + 192,
        width: buttonWidth,
        height: buttonHeight,
      },
      text: "PLAY",
      action: "open-worlds",
      scale: 3,
      variant: "primary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "settings-button",
      kind: "button",
      rect: {
        x: buttonX,
        y: shell.panelY + 266,
        width: buttonWidth,
        height: buttonHeight,
      },
      text: "SETTINGS",
      action: "open-settings",
      scale: 3,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "quit-button",
      kind: "button",
      rect: {
        x: buttonX,
        y: shell.panelY + 340,
        width: buttonWidth,
        height: buttonHeight,
      },
      text: "QUIT GAME",
      action: "quit-game",
      scale: 3,
      variant: "secondary",
    }),
    createLabel({
      id: "status-label",
      kind: "label",
      rect: {
        x: shell.panelX + 36,
        y: shell.panelY + 408,
        width: panelWidth - 72,
        height: 24,
      },
      text: viewModel.statusText,
      scale: 2,
      color: viewModel.busy ? [0.96, 0.82, 0.46] : [0.86, 0.9, 0.94],
      centered: true,
    }),
  ];
};

const buildWorldList = (
  viewModel: MainMenuViewModel,
  listX: number,
  listY: number,
  listWidth: number,
): UiComponent[] => {
  const visibleWorlds = viewModel.worlds.slice(0, 6);

  if (visibleWorlds.length === 0) {
    return [
      createLabel({
        id: "world-empty",
        kind: "label",
        rect: {
          x: listX + 30,
          y: listY + 92,
          width: listWidth - 60,
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
          x: listX + 30,
          y: listY + 136,
          width: listWidth - 60,
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
      rect: {
        x: listX + 22,
        y: listY + 56 + index * 60,
        width: listWidth - 44,
        height: 48,
      },
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
  const panelHeight = 570;
  const shell = buildMenuShell(
    width,
    height,
    "SELECT WORLD",
    "Click a world to focus it, or create a new one",
    seed,
    panelWidth,
    panelHeight,
  );
  const listX = shell.panelX + 36;
  const listY = shell.panelY + 132;
  const listWidth = 540;
  const sideX = shell.panelX + 608;
  const buttonWidth = 320;
  const buttonHeight = 52;
  const selectedWorld = viewModel.worlds.find((world) => world.name === viewModel.selectedWorldName) ?? null;

  return [
    ...shell.components,
    createPanel({
      id: "world-list-frame",
      kind: "panel",
      rect: {
        x: listX,
        y: listY,
        width: listWidth,
        height: 364,
      },
      color: [0.11, 0.12, 0.13],
    }),
    createPanel({
      id: "world-list-panel",
      kind: "panel",
      rect: {
        x: listX + 4,
        y: listY + 4,
        width: listWidth - 8,
        height: 356,
      },
      color: [0.24, 0.26, 0.28],
    }),
    createLabel({
      id: "world-list-title",
      kind: "label",
      rect: {
        x: listX + 22,
        y: listY + 18,
        width: listWidth - 44,
        height: 24,
      },
      text: "YOUR WORLDS",
      scale: 3,
      color: [0.94, 0.95, 0.96],
      centered: false,
    }),
    ...buildWorldList(viewModel, listX, listY, listWidth),
    createPanel({
      id: "world-side-panel",
      kind: "panel",
      rect: {
        x: sideX,
        y: listY,
        width: 336,
        height: 364,
      },
      color: [0.19, 0.2, 0.22],
    }),
    createLabel({
      id: "world-selection-title",
      kind: "label",
      rect: {
        x: sideX + 20,
        y: listY + 18,
        width: 296,
        height: 24,
      },
      text: "FOCUSED WORLD",
      scale: 3,
      color: [0.94, 0.95, 0.96],
      centered: true,
    }),
    createLabel({
      id: "world-selection-name",
      kind: "label",
      rect: {
        x: sideX + 20,
        y: listY + 64,
        width: 296,
        height: 44,
      },
      text: selectedWorld?.name ?? "CLICK A WORLD",
      scale: 3,
      color: selectedWorld ? [0.98, 0.95, 0.76] : [0.8, 0.84, 0.88],
      centered: true,
    }),
    createLabel({
      id: "world-selection-seed",
      kind: "label",
      rect: {
        x: sideX + 20,
        y: listY + 112,
        width: 296,
        height: 24,
      },
      text: selectedWorld ? `SEED ${selectedWorld.seed}` : "FOCUS ONE WITH A MOUSE CLICK",
      scale: 2,
      color: [0.84, 0.88, 0.91],
      centered: true,
    }),
    createButton({
      id: "join-button",
      kind: "button",
      rect: {
        x: sideX + 8,
        y: listY + 166,
        width: buttonWidth,
        height: buttonHeight,
      },
      text: viewModel.busy ? "JOINING..." : "PLAY SELECTED WORLD",
      action: "join-world",
      scale: 2,
      variant: "primary",
      disabled: viewModel.busy || selectedWorld === null,
    }),
    createButton({
      id: "create-button",
      kind: "button",
      rect: {
        x: sideX + 8,
        y: listY + 230,
        width: buttonWidth,
        height: buttonHeight,
      },
      text: "CREATE WORLD",
      action: "open-create-world",
      scale: 3,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "refresh-button",
      kind: "button",
      rect: {
        x: sideX + 8,
        y: listY + 294,
        width: 152,
        height: buttonHeight,
      },
      text: "REFRESH",
      action: "refresh-worlds",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "delete-button",
      kind: "button",
      rect: {
        x: sideX + 176,
        y: listY + 294,
        width: 152,
        height: buttonHeight,
      },
      text: "DELETE",
      action: "delete-world",
      scale: 2,
      variant: "danger",
      disabled: viewModel.busy || selectedWorld === null,
    }),
    createButton({
      id: "back-button",
      kind: "button",
      rect: {
        x: shell.panelX + 36,
        y: shell.panelY + 514,
        width: 200,
        height: 42,
      },
      text: "BACK",
      action: "back-to-play",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createLabel({
      id: "status-label",
      kind: "label",
      rect: {
        x: shell.panelX + 254,
        y: shell.panelY + 514,
        width: panelWidth - 290,
        height: 42,
      },
      text: viewModel.statusText,
      scale: 2,
      color: viewModel.busy ? [0.96, 0.82, 0.46] : [0.86, 0.9, 0.94],
      centered: false,
    }),
  ];
};

const buildCreateWorldMenu = (
  width: number,
  height: number,
  viewModel: MainMenuViewModel,
  seed: number,
): UiComponent[] => {
  const panelWidth = 760;
  const panelHeight = 470;
  const shell = buildMenuShell(
    width,
    height,
    "CREATE NEW WORLD",
    "Set a name and optional numeric seed",
    seed,
    panelWidth,
    panelHeight,
  );
  const contentX = shell.panelX + 112;
  const fieldWidth = 536;
  const fieldHeight = 60;

  return [
    ...shell.components,
    createLabel({
      id: "create-world-hint",
      kind: "label",
      rect: {
        x: shell.panelX + 80,
        y: shell.panelY + 136,
        width: panelWidth - 160,
        height: 28,
      },
      text: "PRESS TAB TO SWITCH FIELDS",
      scale: 2,
      color: [0.86, 0.9, 0.94],
      centered: true,
    }),
    createButton({
      id: "name-input",
      kind: "button",
      rect: {
        x: contentX,
        y: shell.panelY + 184,
        width: fieldWidth,
        height: fieldHeight,
      },
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
      rect: {
        x: contentX,
        y: shell.panelY + 258,
        width: fieldWidth,
        height: fieldHeight,
      },
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
      rect: {
        x: contentX,
        y: shell.panelY + 346,
        width: 258,
        height: 54,
      },
      text: viewModel.busy ? "CREATING..." : "CREATE WORLD",
      action: "create-world",
      scale: 3,
      variant: "primary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: "cancel-create-button",
      kind: "button",
      rect: {
        x: contentX + 278,
        y: shell.panelY + 346,
        width: 258,
        height: 54,
      },
      text: "CANCEL",
      action: "back-to-worlds",
      scale: 3,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createLabel({
      id: "status-label",
      kind: "label",
      rect: {
        x: shell.panelX + 56,
        y: shell.panelY + 416,
        width: panelWidth - 112,
        height: 24,
      },
      text: viewModel.statusText,
      scale: 2,
      color: viewModel.busy ? [0.96, 0.82, 0.46] : [0.86, 0.9, 0.94],
      centered: true,
    }),
  ];
};

export interface SettingsPanelViewModel {
  settings: ClientSettings;
  statusText: string;
  busy: boolean;
}

interface SettingsPanelOptions {
  panelX: number;
  panelY: number;
  panelWidth: number;
  panelHeight: number;
  viewModel: SettingsPanelViewModel;
  backAction: string;
  idPrefix?: string;
}

const buildSettingsPanelContents = ({
  panelX,
  panelY,
  panelWidth,
  panelHeight,
  viewModel,
  backAction,
  idPrefix = "settings",
}: SettingsPanelOptions): UiComponent[] => {
  const contentX = panelX + 72;
  const sliderWidth = 540;
  const valueLabelWidth = 150;
  const rowHeight = 58;
  const sliderX = contentX + 178;
  const valueX = panelX + panelWidth - valueLabelWidth - 72;

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
      y: panelY + 176,
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
      y: panelY + 246,
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
      y: panelY + 316,
    },
  ] as const;

  const sliderComponents = sliderRows.flatMap((row) => [
    createLabel({
      id: `${row.id}-label`,
      kind: "label",
      rect: {
        x: contentX,
        y: row.y + 2,
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
        y: row.y + 2,
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
        y: row.y + 26,
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

  return [
    createLabel({
      id: `${idPrefix}-gameplay-title`,
      kind: "label",
      rect: {
        x: contentX,
        y: panelY + 130,
        width: panelWidth - 144,
        height: 24,
      },
      text: "GAMEPLAY",
      scale: 3,
      color: [0.98, 0.95, 0.76],
      centered: false,
    }),
    ...sliderComponents,
    createLabel({
      id: `${idPrefix}-graphics-title`,
      kind: "label",
      rect: {
        x: contentX,
        y: panelY + 392,
        width: panelWidth - 144,
        height: 24,
      },
      text: "GRAPHICS",
      scale: 3,
      color: [0.98, 0.95, 0.76],
      centered: false,
    }),
    createButton({
      id: `${idPrefix}-debug-toggle`,
      kind: "button",
      rect: {
        x: contentX,
        y: panelY + 430,
        width: 336,
        height: rowHeight,
      },
      text: `DEBUG INFO: ${formatToggleValue(viewModel.settings.showDebugOverlay)}`,
      action: "toggle-setting:showDebugOverlay",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: `${idPrefix}-crosshair-toggle`,
      kind: "button",
      rect: {
        x: contentX + 356,
        y: panelY + 430,
        width: 336,
        height: rowHeight,
      },
      text: `CROSSHAIR: ${formatToggleValue(viewModel.settings.showCrosshair)}`,
      action: "toggle-setting:showCrosshair",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: `${idPrefix}-reset`,
      kind: "button",
      rect: {
        x: contentX,
        y: panelY + 512,
        width: 244,
        height: 50,
      },
      text: "RESET DEFAULTS",
      action: "reset-settings",
      scale: 2,
      variant: "secondary",
      disabled: viewModel.busy,
    }),
    createButton({
      id: `${idPrefix}-back`,
      kind: "button",
      rect: {
        x: panelX + panelWidth - 244 - 72,
        y: panelY + 512,
        width: 244,
        height: 50,
      },
      text: "BACK",
      action: backAction,
      scale: 3,
      variant: "primary",
      disabled: viewModel.busy,
    }),
    createLabel({
      id: `${idPrefix}-status`,
      kind: "label",
      rect: {
        x: panelX + 72,
        y: panelY + panelHeight - 44,
        width: panelWidth - 144,
        height: 22,
      },
      text: viewModel.statusText,
      scale: 2,
      color: viewModel.busy ? [0.96, 0.82, 0.46] : [0.86, 0.9, 0.94],
      centered: true,
    }),
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
      panelX: shell.panelX,
      panelY: shell.panelY,
      panelWidth,
      panelHeight,
      viewModel,
      backAction: "back-to-play",
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
  const panelX = Math.round((width - panelWidth) / 2);
  const panelY = Math.round((height - panelHeight) / 2);

  return [
    createPanel({
      id: "pause-settings-dim",
      kind: "panel",
      rect: { x: 0, y: 0, width, height },
      color: [0.03, 0.04, 0.05, 0.62],
    }),
    createPanel({
      id: "pause-settings-shadow",
      kind: "panel",
      rect: {
        x: panelX - 10,
        y: panelY - 10,
        width: panelWidth + 20,
        height: panelHeight + 20,
      },
      color: [0.07, 0.08, 0.1, 0.84],
    }),
    createPanel({
      id: "pause-settings-frame",
      kind: "panel",
      rect: {
        x: panelX - 4,
        y: panelY - 4,
        width: panelWidth + 8,
        height: panelHeight + 8,
      },
      color: [0.22, 0.23, 0.24, 0.96],
    }),
    createPanel({
      id: "pause-settings-panel",
      kind: "panel",
      rect: {
        x: panelX,
        y: panelY,
        width: panelWidth,
        height: panelHeight,
      },
      color: [0.16, 0.18, 0.2, 0.97],
    }),
    createLabel({
      id: "pause-settings-title",
      kind: "label",
      rect: {
        x: panelX + 30,
        y: panelY + 26,
        width: panelWidth - 60,
        height: 58,
      },
      text: "SETTINGS",
      scale: 5,
      color: [0.98, 0.98, 0.98],
      centered: true,
    }),
    createLabel({
      id: "pause-settings-subtitle",
      kind: "label",
      rect: {
        x: panelX + 30,
        y: panelY + 86,
        width: panelWidth - 60,
        height: 30,
      },
      text: "Adjust settings without leaving your world",
      scale: 2,
      color: [0.82, 0.86, 0.89],
      centered: true,
    }),
    ...buildSettingsPanelContents({
      panelX,
      panelY,
      panelWidth,
      panelHeight,
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

  if (viewModel.activeScreen === "worlds") {
    return buildWorldsMenu(width, height, viewModel, seed);
  }

  if (viewModel.activeScreen === "create-world") {
    return buildCreateWorldMenu(width, height, viewModel, seed);
  }

  return buildPlayMenu(width, height, viewModel, seed);
};
