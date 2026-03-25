import { buildVoxelBackdrop } from "./menu.ts";
import { createLabel, createPanel, type UiComponent } from "./components.ts";

export interface LoadingScreenViewModel {
  targetName: string;
  transportLabel: string;
  statusText: string;
  progressPercent: number | null;
}

export const buildLoadingScreen = (
  width: number,
  height: number,
  viewModel: LoadingScreenViewModel,
  seed: number,
): UiComponent[] => {
  const panelWidth = 720;
  const panelHeight = 320;
  const panelX = Math.round((width - panelWidth) / 2);
  const panelY = Math.round((height - panelHeight) / 2);
  const progressText =
    viewModel.progressPercent === null
      ? null
      : `${Math.max(0, Math.min(100, Math.round(viewModel.progressPercent)))}%`;
  const progressBarWidth = panelWidth - 144;
  const normalizedProgress =
    viewModel.progressPercent === null
      ? 0.42
      : Math.max(0, Math.min(1, viewModel.progressPercent / 100));

  return [
    ...buildVoxelBackdrop(width, height, seed),
    createPanel({
      id: "loading-shadow",
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
      id: "loading-frame",
      kind: "panel",
      rect: {
        x: panelX - 4,
        y: panelY - 4,
        width: panelWidth + 8,
        height: panelHeight + 8,
      },
      color: [0.24, 0.26, 0.28],
    }),
    createPanel({
      id: "loading-panel",
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
      id: "loading-transport",
      kind: "label",
      rect: {
        x: panelX + 48,
        y: panelY + 38,
        width: panelWidth - 96,
        height: 22,
      },
      text: viewModel.transportLabel,
      scale: 2,
      color: [0.82, 0.9, 0.98],
      centered: true,
    }),
    createLabel({
      id: "loading-target",
      kind: "label",
      rect: {
        x: panelX + 48,
        y: panelY + 78,
        width: panelWidth - 96,
        height: 34,
      },
      text: viewModel.targetName.toUpperCase(),
      scale: 3,
      color: [0.98, 0.98, 0.98],
      centered: true,
    }),
    createLabel({
      id: "loading-status",
      kind: "label",
      rect: {
        x: panelX + 56,
        y: panelY + 146,
        width: panelWidth - 112,
        height: 22,
      },
      text: viewModel.statusText,
      scale: 2,
      color: [0.92, 0.93, 0.96],
      centered: true,
    }),
    createPanel({
      id: "loading-progress-frame",
      kind: "panel",
      rect: {
        x: panelX + 72,
        y: panelY + 208,
        width: progressBarWidth,
        height: 24,
      },
      color: [0.08, 0.09, 0.1],
    }),
    createPanel({
      id: "loading-progress-fill",
      kind: "panel",
      rect: {
        x: panelX + 76,
        y: panelY + 212,
        width: Math.max(8, Math.round((progressBarWidth - 8) * normalizedProgress)),
        height: 16,
      },
      color:
        viewModel.progressPercent === null
          ? [0.48, 0.66, 0.82]
          : [0.47, 0.76, 0.43],
    }),
    createLabel({
      id: "loading-progress-label",
      kind: "label",
      rect: {
        x: panelX + 72,
        y: panelY + 252,
        width: panelWidth - 144,
        height: 18,
      },
      text: progressText ?? "WAITING FOR STARTUP CHUNKS",
      scale: 2,
      color: [0.84, 0.87, 0.91],
      centered: true,
    }),
  ];
};
