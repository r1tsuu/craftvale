import type { WorldSummary } from "../shared/messages.ts";
import {
  createButton,
  createLabel,
  createPanel,
  type UiComponent,
} from "./components.ts";

export interface MainMenuViewModel {
  worlds: readonly WorldSummary[];
  selectedWorldName: string | null;
  createWorldName: string;
  createSeedText: string;
  focusedField: "world-name" | "world-seed" | null;
  statusText: string;
  busy: boolean;
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

export const buildMainMenu = (
  width: number,
  height: number,
  viewModel: MainMenuViewModel,
  seed = 1337,
): UiComponent[] => {
  const panelWidth = 980;
  const panelHeight = 560;
  const panelX = Math.round((width - panelWidth) / 2);
  const panelY = Math.round((height - panelHeight) / 2);
  const listPanelWidth = 420;
  const buttonWidth = 320;
  const buttonHeight = 56;
  const listX = panelX + 40;
  const formX = panelX + 520;
  const buttonX = formX;

  const worldButtons: UiComponent[] = [];
  const visibleWorlds = viewModel.worlds.slice(0, 6);

  if (visibleWorlds.length === 0) {
    worldButtons.push(
      createLabel({
        id: "world-empty",
        kind: "label",
        rect: {
          x: listX,
          y: panelY + 170,
          width: listPanelWidth - 80,
          height: 40,
        },
        text: "NO WORLDS YET",
        scale: 3,
        color: [0.82, 0.88, 0.92],
        centered: true,
      }),
    );
  } else {
    visibleWorlds.forEach((world, index) => {
      const selected = world.name === viewModel.selectedWorldName;
      worldButtons.push(
        createButton({
          id: `world-${index}`,
          kind: "button",
          rect: {
            x: listX,
            y: panelY + 138 + index * 62,
            width: listPanelWidth - 80,
            height: 52,
          },
          text: `${selected ? "> " : ""}${world.name}  S:${world.seed}`,
          action: `select-world:${world.name}`,
          scale: 2,
        }),
      );
    });
  }

  return [
    ...buildVoxelBackdrop(width, height, seed),
    createPanel({
      id: "menu-backdrop",
      kind: "panel",
      rect: {
        x: panelX - 8,
        y: panelY - 8,
        width: panelWidth + 16,
        height: panelHeight + 16,
      },
      color: [0.12, 0.16, 0.2],
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
      color: [0.18, 0.24, 0.3],
    }),
    createLabel({
      id: "menu-title",
      kind: "label",
      rect: {
        x: panelX + 40,
        y: panelY + 32,
        width: panelWidth - 80,
        height: 50,
      },
      text: "MINECRAFT CLONE",
      scale: 5,
      color: [0.98, 0.98, 0.98],
      centered: true,
    }),
    createLabel({
      id: "menu-subtitle-left",
      kind: "label",
      rect: {
        x: listX,
        y: panelY + 88,
        width: 260,
        height: 24,
      },
      text: "WORLD LIST",
      scale: 3,
      color: [0.78, 0.86, 0.9],
      centered: false,
    }),
    createLabel({
      id: "menu-subtitle-right",
      kind: "label",
      rect: {
        x: formX,
        y: panelY + 88,
        width: 320,
        height: 24,
      },
      text: "CREATE WORLD",
      scale: 3,
      color: [0.78, 0.86, 0.9],
      centered: false,
    }),
    ...worldButtons,
    createButton({
      id: "refresh-button",
      kind: "button",
      rect: {
        x: listX,
        y: panelY + 470,
        width: 160,
        height: buttonHeight,
      },
      text: "REFRESH",
      action: "refresh-worlds",
      scale: 3,
    }),
    createButton({
      id: "join-button",
      kind: "button",
      rect: {
        x: listX + 176,
        y: panelY + 470,
        width: 160,
        height: buttonHeight,
      },
      text: "JOIN",
      action: "join-world",
      scale: 3,
    }),
    createButton({
      id: "delete-button",
      kind: "button",
      rect: {
        x: listX + 352,
        y: panelY + 470,
        width: 160,
        height: buttonHeight,
      },
      text: "DELETE",
      action: "delete-world",
      scale: 3,
    }),
    createButton({
      id: "name-input",
      kind: "button",
      rect: {
        x: buttonX,
        y: panelY + 150,
        width: buttonWidth,
        height: buttonHeight,
      },
      text: formatInputValue(
        "NAME",
        viewModel.createWorldName,
        viewModel.focusedField === "world-name",
        "TYPE A NAME",
      ),
      action: "focus-world-name",
      scale: 2,
    }),
    createButton({
      id: "seed-input",
      kind: "button",
      rect: {
        x: buttonX,
        y: panelY + 222,
        width: buttonWidth,
        height: buttonHeight,
      },
      text: formatInputValue(
        "SEED",
        viewModel.createSeedText,
        viewModel.focusedField === "world-seed",
        "BLANK = RANDOM",
      ),
      action: "focus-world-seed",
      scale: 2,
    }),
    createButton({
      id: "create-button",
      kind: "button",
      rect: {
        x: buttonX,
        y: panelY + 310,
        width: buttonWidth,
        height: buttonHeight,
      },
      text: viewModel.busy ? "WORKING..." : "CREATE WORLD",
      action: "create-world",
      scale: 3,
    }),
    createButton({
      id: "quit-button",
      kind: "button",
      rect: {
        x: buttonX,
        y: panelY + 382,
        width: buttonWidth,
        height: buttonHeight,
      },
      text: "QUIT",
      action: "quit-game",
      scale: 3,
    }),
    createLabel({
      id: "status-label",
      kind: "label",
      rect: {
        x: formX,
        y: panelY + 470,
        width: 360,
        height: 44,
      },
      text: viewModel.statusText,
      scale: 2,
      color: viewModel.busy ? [0.96, 0.82, 0.46] : [0.86, 0.9, 0.94],
    }),
  ];
};
