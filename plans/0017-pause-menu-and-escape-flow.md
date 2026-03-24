# Pause Menu And Escape Flow

## Summary
Change `Esc` from a hard quit shortcut into a layered UI control that behaves more like Minecraft. The game should only close through the explicit exit button in the main menu. During gameplay, `Esc` should pause the world and open an in-game menu with options to return to the game, open settings, or exit back to the main menu.

## Key Changes

### Remove hard-quit behavior from `Esc`
- Stop treating `Esc` as a direct call to `requestClose()` during normal runtime.
- Keep explicit quitting available through the main menu `EXIT` button only.
- Recommended behavior:
  - in the main menu, `Esc` should do nothing unless we later add a clearer back-navigation convention
  - during gameplay, `Esc` should never close the app directly

### Introduce an in-game paused state
- Add an explicit paused/menu-open state to `GameApp` instead of overloading the existing top-level main-menu mode.
- Keep the current top-level app distinction:
  - main menu
  - playing
- Within playing, add a pause overlay state that suppresses gameplay simulation and opens the cursor.
- Strong recommendation:
  - treat pause as a play-overlay screen similar to chat and inventory ownership in `GameApp`
  - do not bounce the app back into the main menu just to show pause actions

### Define `Esc` priority while playing
- `Esc` should resolve the most local overlay first.
- Recommended order:
  - if inventory is open, close inventory
  - else if chat is open, close chat and clear or keep draft based on current expected UX
  - else if settings-from-pause is open, return to the pause menu
  - else open the pause menu
- This keeps `Esc` intuitive and avoids surprising jumps straight to the main menu.

### Add a dedicated pause menu overlay
- Create a lightweight pause overlay UI rendered on top of the game view.
- The menu should include:
  - `BACK TO GAME`
  - `SETTINGS`
  - `EXIT TO MENU`
- Keep the visual style aligned with the existing menu work:
  - framed panel
  - centered buttons
  - translucent backdrop or dimming layer over the live world view
- Recommended first pass:
  - freeze game updates while paused
  - keep the 3D scene visible underneath
  - show the system cursor while paused

### Reuse the settings screen from pause flow
- The in-game pause flow should be able to open settings without forcing the user back to the main menu.
- Recommended approach:
  - add a settings context/source to the current menu or overlay state
  - reuse the same settings UI builder rather than duplicating controls
- Important behavior:
  - `BACK` from settings should return to the pause menu when opened from pause
  - `BACK` from settings should return to the title play screen when opened from the main menu

### Support exiting to the main menu cleanly
- Add an explicit `EXIT TO MENU` flow from the pause menu.
- Exiting to menu should:
  - leave the active world session cleanly
  - save the world if the current shutdown/menu-return path expects that
  - clear transient play-only UI state such as chat, inventory, and pause status
  - restore the cursor and return to the main menu screen
- Be careful not to close the whole app when the user only wants to leave the world.

### Keep pause fully client-owned
- Pausing in the current single-player worker-backed architecture can remain client-owned.
- No new server message types should be necessary for a first pass.
- The paused state only needs to:
  - stop local movement/block actions/chunk request churn
  - keep the current replicated world state available for rendering

### Update input and cursor management
- Cursor-lock behavior needs to account for pause just like inventory already does.
- Recommended behavior:
  - gameplay active: cursor locked
  - chat active: cursor locked
  - inventory open: cursor unlocked
  - pause menu open: cursor unlocked
  - pause-settings open: cursor unlocked
- Avoid conflicting cursor transitions between inventory, pause, and menu flows.

### Extend UI layering for play overlays
- The current HUD path is already handling chat and inventory overlays.
- Expand that structure to support:
  - pause panel
  - possibly pause-settings panel if we keep settings inside the play overlay path
- Strong recommendation:
  - keep pause/inventory/chat ownership centralized in `GameApp`
  - keep UI builders pure and driven by a small overlay-state view model

### Preserve the explicit main-menu exit button
- The main-menu `EXIT` button remains the only direct app-close route.
- Keep that behavior unchanged so users still have a clear intentional quit path.
- If desired later, the pause menu can gain a separate `QUIT GAME` button, but that is out of scope for this plan as written.

## Important Files
- `plans/0017-pause-menu-and-escape-flow.md`
- `README.md`
- `architecture.md`
- `src/game-app.ts`
- `src/client/menu-state.ts`
- `src/ui/menu.ts`
- `src/ui/hud.ts`
- `src/ui/components.ts`
- `src/ui/renderer.ts`
- `src/platform/native.ts`
- `tests/menu-state.test.ts`
- `tests/menu-ui.test.ts`
- `tests/hud.test.ts`
- `tests/ui.test.ts`

## Test Plan
- Input-flow tests:
  - `Esc` in the main menu does not close the app
  - `Esc` during gameplay opens the pause menu instead of closing the app
  - `Esc` closes inventory before opening pause
  - `Esc` closes chat before opening pause
  - `Esc` from pause-settings returns to pause
- Pause-menu UI tests:
  - pause overlay renders `BACK TO GAME`, `SETTINGS`, and `EXIT TO MENU`
  - clicking `BACK TO GAME` resumes play and re-locks the cursor
  - clicking `SETTINGS` opens the settings UI in pause context
  - clicking `EXIT TO MENU` returns to the main menu without closing the app
- Runtime behavior tests:
  - while paused, movement and block actions do not advance
  - while paused, the scene still renders behind the overlay
  - exiting to menu clears play-only overlay state
- Manual smoke tests:
  - press `Esc` in a world and confirm the pause menu opens
  - open settings from pause, change a value, then return to the pause menu
  - resume the game and confirm mouse lock returns
  - exit to menu and confirm the game stays open on the title screen
  - close the app only through the main menu `EXIT` button

## Assumptions And Defaults
- Use the next plan filename in sequence: `0017-pause-menu-and-escape-flow.md`.
- `Esc` should no longer be a hard quit shortcut anywhere in the game loop.
- The first pass targets pause plus exit-to-menu, not a full multiplayer pause protocol.
- Settings UI should be reused between title-menu and pause-menu contexts instead of duplicated.
