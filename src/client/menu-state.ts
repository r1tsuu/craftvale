import type { InputState } from "../types.ts";
import type { WorldSummary } from "../shared/messages.ts";

export type MenuFocusField = "world-name" | "world-seed" | null;

export interface MenuState {
  worlds: WorldSummary[];
  selectedWorldName: string | null;
  createWorldName: string;
  createSeedText: string;
  focusedField: MenuFocusField;
  statusText: string;
  busy: boolean;
}

export const createMenuState = (): MenuState => ({
  worlds: [],
  selectedWorldName: null,
  createWorldName: "",
  createSeedText: "",
  focusedField: "world-name",
  statusText: "LOADING WORLDS...",
  busy: false,
});

const normalizeSelection = (
  worlds: readonly WorldSummary[],
  selectedWorldName: string | null,
): string | null => {
  if (!worlds.length) {
    return null;
  }

  if (selectedWorldName && worlds.some((world) => world.name === selectedWorldName)) {
    return selectedWorldName;
  }

  return worlds[0]?.name ?? null;
};

export const setMenuWorlds = (
  state: MenuState,
  worlds: readonly WorldSummary[],
): MenuState => ({
  ...state,
  worlds: [...worlds],
  selectedWorldName: normalizeSelection(worlds, state.selectedWorldName),
});

export const setMenuBusy = (state: MenuState, busy: boolean, statusText?: string): MenuState => ({
  ...state,
  busy,
  statusText: statusText ?? state.statusText,
});

export const setMenuStatus = (state: MenuState, statusText: string): MenuState => ({
  ...state,
  statusText,
});

export const applyMenuAction = (state: MenuState, action: string): MenuState => {
  if (action.startsWith("select-world:")) {
    return {
      ...state,
      selectedWorldName: action.slice("select-world:".length),
    };
  }

  if (action === "focus-world-name") {
    return {
      ...state,
      focusedField: "world-name",
    };
  }

  if (action === "focus-world-seed") {
    return {
      ...state,
      focusedField: "world-seed",
    };
  }

  return state;
};

const sanitizeWorldNameInput = (value: string): string =>
  value.replace(/[^\w \-]/g, "").slice(0, 24);

const sanitizeSeedInput = (value: string): string =>
  value.replace(/[^0-9\-]/g, "").slice(0, 16);

const cycleFocus = (focusedField: MenuFocusField): MenuFocusField => {
  if (focusedField === "world-name") {
    return "world-seed";
  }

  if (focusedField === "world-seed") {
    return "world-name";
  }

  return "world-name";
};

export const applyMenuTyping = (state: MenuState, input: InputState): MenuState => {
  let nextState = state;

  if (input.tabPressed) {
    nextState = {
      ...nextState,
      focusedField: cycleFocus(nextState.focusedField),
    };
  }

  if (!nextState.focusedField) {
    return nextState;
  }

  if (input.typedText.length > 0) {
    if (nextState.focusedField === "world-name") {
      nextState = {
        ...nextState,
        createWorldName: sanitizeWorldNameInput(nextState.createWorldName + input.typedText),
      };
    } else {
      nextState = {
        ...nextState,
        createSeedText: sanitizeSeedInput(nextState.createSeedText + input.typedText),
      };
    }
  }

  if (!input.backspacePressed) {
    return nextState;
  }

  if (nextState.focusedField === "world-name") {
    return {
      ...nextState,
      createWorldName: nextState.createWorldName.slice(0, -1),
    };
  }

  return {
    ...nextState,
    createSeedText: nextState.createSeedText.slice(0, -1),
  };
};

export const parseSeedInput = (seedText: string): number => {
  const trimmed = seedText.trim();
  if (!trimmed) {
    return (Date.now() ^ 0x9e3779b9) >>> 0;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed)) {
    return (Date.now() ^ 0x85ebca6b) >>> 0;
  }

  return parsed >>> 0;
};
