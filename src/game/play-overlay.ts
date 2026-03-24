export type PauseScreen = "closed" | "menu" | "settings";

export interface PlayOverlayState {
  chatOpen: boolean;
  inventoryOpen: boolean;
  pauseScreen: PauseScreen;
}

export type PlayEscapeAction =
  | "close-inventory"
  | "close-chat"
  | "back-to-pause-menu"
  | "resume-game"
  | "open-pause-menu";

export const resolvePlayEscapeAction = (state: PlayOverlayState): PlayEscapeAction => {
  if (state.inventoryOpen) {
    return "close-inventory";
  }

  if (state.chatOpen) {
    return "close-chat";
  }

  if (state.pauseScreen === "settings") {
    return "back-to-pause-menu";
  }

  if (state.pauseScreen === "menu") {
    return "resume-game";
  }

  return "open-pause-menu";
};

export const isGameplaySuppressed = (state: PlayOverlayState): boolean =>
  state.chatOpen || state.inventoryOpen || state.pauseScreen !== "closed";

export const shouldLockCursor = (
  appMode: "menu" | "playing",
  state: Pick<PlayOverlayState, "inventoryOpen" | "pauseScreen">,
): boolean => appMode === "playing" && !state.inventoryOpen && state.pauseScreen === "closed";
