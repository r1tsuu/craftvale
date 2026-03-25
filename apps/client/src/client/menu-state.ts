import type { WorldSummary } from "@voxel/core/shared";
import type { InputState, SavedServerRecord } from "../types.ts";

export type MenuScreen =
  | "play"
  | "worlds"
  | "create-world"
  | "multiplayer"
  | "add-server"
  | "settings";

export type MenuFocusField =
  | "world-name"
  | "world-seed"
  | "server-name"
  | "server-address"
  | null;

export interface MenuState {
  activeScreen: MenuScreen;
  worlds: WorldSummary[];
  selectedWorldName: string | null;
  servers: SavedServerRecord[];
  selectedServerId: string | null;
  createWorldName: string;
  createSeedText: string;
  addServerName: string;
  addServerAddress: string;
  focusedField: MenuFocusField;
  statusText: string;
  busy: boolean;
}

export const createMenuState = (): MenuState => ({
  activeScreen: "play",
  worlds: [],
  selectedWorldName: null,
  servers: [],
  selectedServerId: null,
  createWorldName: "",
  createSeedText: "",
  addServerName: "",
  addServerAddress: "",
  focusedField: null,
  statusText: "SELECT A MODE",
  busy: false,
});

const DEFAULT_WORLD_NAME = "New World";

const normalizeSelection = (
  worlds: readonly WorldSummary[],
  selectedWorldName: string | null,
): string | null => {
  if (selectedWorldName && worlds.some((world) => world.name === selectedWorldName)) {
    return selectedWorldName;
  }

  return null;
};

const normalizeServerSelection = (
  servers: readonly SavedServerRecord[],
  selectedServerId: string | null,
): string | null => {
  if (selectedServerId && servers.some((server) => server.id === selectedServerId)) {
    return selectedServerId;
  }

  return null;
};

export const suggestWorldName = (worlds: readonly WorldSummary[]): string => {
  const takenNames = new Set(worlds.map((world) => world.name.trim().toLowerCase()));
  if (!takenNames.has(DEFAULT_WORLD_NAME.toLowerCase())) {
    return DEFAULT_WORLD_NAME;
  }

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${DEFAULT_WORLD_NAME} ${suffix}`;
    if (!takenNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${DEFAULT_WORLD_NAME} ${Date.now()}`;
};

export const setMenuWorlds = (
  state: MenuState,
  worlds: readonly WorldSummary[],
): MenuState => ({
  ...state,
  worlds: [...worlds],
  selectedWorldName: normalizeSelection(worlds, state.selectedWorldName),
});

export const setMenuServers = (
  state: MenuState,
  servers: readonly SavedServerRecord[],
): MenuState => ({
  ...state,
  servers: [...servers],
  selectedServerId: normalizeServerSelection(servers, state.selectedServerId),
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
  if (action === "open-play" || action === "back-to-play") {
    return {
      ...state,
      activeScreen: "play",
      focusedField: null,
    };
  }

  if (action === "open-worlds" || action === "back-to-worlds") {
    return {
      ...state,
      activeScreen: "worlds",
      focusedField: null,
    };
  }

  if (action === "open-create-world") {
    return {
      ...state,
      activeScreen: "create-world",
      createWorldName: suggestWorldName(state.worlds),
      createSeedText: "",
      focusedField: "world-name",
    };
  }

  if (action === "open-multiplayer" || action === "back-to-multiplayer") {
    return {
      ...state,
      activeScreen: "multiplayer",
      focusedField: null,
    };
  }

  if (action === "open-add-server") {
    return {
      ...state,
      activeScreen: "add-server",
      addServerName: "",
      addServerAddress: "",
      focusedField: "server-name",
    };
  }

  if (action === "open-settings") {
    return {
      ...state,
      activeScreen: "settings",
      focusedField: null,
    };
  }

  if (action.startsWith("select-world:")) {
    return {
      ...state,
      selectedWorldName: action.slice("select-world:".length),
    };
  }

  if (action.startsWith("select-server:")) {
    return {
      ...state,
      selectedServerId: action.slice("select-server:".length),
    };
  }

  if (action === "focus-world-name") {
    return {
      ...state,
      activeScreen: "create-world",
      focusedField: "world-name",
    };
  }

  if (action === "focus-world-seed") {
    return {
      ...state,
      activeScreen: "create-world",
      focusedField: "world-seed",
    };
  }

  if (action === "focus-server-name") {
    return {
      ...state,
      activeScreen: "add-server",
      focusedField: "server-name",
    };
  }

  if (action === "focus-server-address") {
    return {
      ...state,
      activeScreen: "add-server",
      focusedField: "server-address",
    };
  }

  return state;
};

const sanitizeWorldNameInput = (value: string): string =>
  value.replace(/[^\w \-]/g, "").slice(0, 24);

const sanitizeSeedInput = (value: string): string =>
  value.replace(/[^0-9\-]/g, "").slice(0, 16);

const sanitizeServerNameInput = (value: string): string =>
  value.replace(/[^\w \-]/g, "").slice(0, 32);

const sanitizeServerAddressInput = (value: string): string =>
  value.replace(/[^A-Za-z0-9.\-:\[\]]/g, "").slice(0, 128);

const cycleFocus = (state: MenuState): MenuFocusField => {
  if (state.activeScreen === "create-world") {
    if (state.focusedField === "world-name") {
      return "world-seed";
    }

    if (state.focusedField === "world-seed") {
      return "world-name";
    }

    return "world-name";
  }

  if (state.activeScreen === "add-server") {
    if (state.focusedField === "server-name") {
      return "server-address";
    }

    if (state.focusedField === "server-address") {
      return "server-name";
    }

    return "server-name";
  }

  return state.focusedField;
};

export const applyMenuTyping = (state: MenuState, input: InputState): MenuState => {
  if (state.activeScreen !== "create-world" && state.activeScreen !== "add-server") {
    return state;
  }

  let nextState = state;

  if (input.tabPressed) {
    nextState = {
      ...nextState,
      focusedField: cycleFocus(nextState),
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
    } else if (nextState.focusedField === "world-seed") {
      nextState = {
        ...nextState,
        createSeedText: sanitizeSeedInput(nextState.createSeedText + input.typedText),
      };
    } else if (nextState.focusedField === "server-name") {
      nextState = {
        ...nextState,
        addServerName: sanitizeServerNameInput(nextState.addServerName + input.typedText),
      };
    } else if (nextState.focusedField === "server-address") {
      nextState = {
        ...nextState,
        addServerAddress: sanitizeServerAddressInput(nextState.addServerAddress + input.typedText),
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

  if (nextState.focusedField === "world-seed") {
    return {
      ...nextState,
      createSeedText: nextState.createSeedText.slice(0, -1),
    };
  }

  if (nextState.focusedField === "server-name") {
    return {
      ...nextState,
      addServerName: nextState.addServerName.slice(0, -1),
    };
  }

  return {
    ...nextState,
    addServerAddress: nextState.addServerAddress.slice(0, -1),
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
