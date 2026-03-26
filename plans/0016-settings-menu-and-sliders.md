# Settings Menu And Slider Controls

## Summary

Add a dedicated `Settings` screen to the main menu, introduce a reusable numeric slider UI component, and wire a first pass of client-local gameplay and graphics settings into the app. The goal is to make the project feel more Minecraft-like without changing the client/server authority model: settings such as FOV, mouse sensitivity, and render distance should live on the client, apply immediately when changed, and persist outside any single world save.

## Key Changes

### Add a Settings entry point to the main menu flow

- Add a `SETTINGS` button to the existing play screen in the main menu.
- Extend menu state with a new `settings` screen instead of treating settings as an overlay or modal.
- Keep the current menu-state pattern:
  - action strings drive transitions
  - `GameApp` stays responsible for responding to higher-level actions
  - `src/ui/menu.ts` remains a pure view builder from menu state
- Recommended actions:
  - `open-settings`
  - `back-to-play`
  - slider-specific actions emitted by the settings screen

### Introduce a client-local settings model

- Add a dedicated settings snapshot for values that belong to the local player and machine, not the world save.
- Recommended first-pass settings:
  - FOV
  - mouse sensitivity
  - render distance
  - a small set of graphics toggles or enumerated quality choices
- Good first-pass graphics settings:
  - show FPS/debug overlay
  - clouds on/off or backdrop decoration on/off if supported cleanly
  - foliage/cutout decoration density toggle only if it fits existing render/world assumptions
  - view bobbing or crosshair toggle as lighter-weight alternatives if graphics toggles are otherwise too deep for this pass
- Avoid putting client settings into authoritative world storage or player inventory storage.

### Persist settings separately from world saves

- Add a lightweight client settings persistence path similar in spirit to the existing local player-name metadata.
- Settings should survive restarts and apply before joining a world.
- Recommended persistence behavior:
  - store a normalized settings snapshot in a local client file
  - clamp invalid or out-of-range values while loading
  - fill missing fields with defaults
- Because the user explicitly does not want legacy compatibility work unless needed, the first version can target only the new settings file shape.

### Add a reusable numeric slider UI primitive

- Extend the lightweight UI system with a slider component rather than hard-coding settings rows as buttons.
- The slider should be generic enough to reuse later for audio, HUD scale, brightness, and similar controls.
- Recommended slider behavior:
  - horizontal track plus draggable thumb
  - click anywhere on the track to jump the value
  - keyboard-free first pass is acceptable if it keeps the implementation clean
  - expose normalized position plus formatted display text
- Keep the slider in the same evaluation/render pipeline as buttons, labels, panels, and hotspots.
- Strong recommendation:
  - add explicit slider-specific resolution/evaluation data instead of overloading button hover logic
  - support continuous dragging, not only click-to-step actions

### Expand menu rendering for a settings screen

- Add a new menu builder in `src/ui/menu.ts` for the settings screen.
- The screen should fit the current visual language:
  - same backdrop and frame treatment as the other menus
  - a vertical stack of labeled controls
  - a clear `BACK` button
- Recommended first-pass settings layout:
  - Gameplay:
    - FOV slider
    - sensitivity slider
    - render distance slider
  - Graphics:
    - 2-3 toggles or compact value selectors
  - Footer:
    - reset-to-defaults
    - back
- Show current numeric values directly in each row so the user does not need to infer slider positions.

### Apply settings to the live client runtime

- Settings changes should affect the active runtime immediately where practical.
- Expected wiring points:
  - FOV should feed into the player camera projection instead of staying a hard-coded constant
  - sensitivity should control mouse-look scaling in `PlayerController`
  - render distance should replace the hard-coded active chunk request radius used by `GameApp` and `ClientWorldRuntime`
- Prefer explicit dependency injection or setter methods over reaching into unrelated modules from the menu layer.
- Render-distance updates should be safe while already in-game:
  - increasing distance requests more chunks
  - decreasing distance should stop requesting the farther rings, with optional cache retention left as an implementation choice

### Add lightweight graphics settings without overcommitting architecture

- Keep the first pass intentionally modest.
- Good candidates are settings that only affect client render/UI behavior and do not require protocol changes:
  - debug text visibility
  - crosshair visibility
  - menu/background decoration density
  - clouds or sky embellishment toggle if implemented in current UI/menu layers
- Be careful with settings that imply a bigger rendering architecture change, such as shadow quality, anti-aliasing, full lighting modes, or texture filtering controls.
- If a graphics option cannot be wired cleanly yet, capture it in the plan as deferred rather than forcing a brittle placeholder.

### Define clear defaults and ranges

- Establish sensible defaults and clamp ranges centrally.
- Recommended starting ranges:
  - FOV: `50` to `110`
  - sensitivity: low-but-usable minimum through a comfortable high value, exposed as a decimal
  - render distance: a conservative chunk radius range that matches current performance expectations
- Keep display formatting user-friendly:
  - FOV as whole-number degrees
  - sensitivity as a short decimal
  - render distance as chunk count or a small integer label

### Keep settings ownership on the client

- The menu screen, input interaction, persistence, and live application should all stay client-owned.
- No server message changes should be necessary for the first pass unless a future setting becomes gameplay-relevant.
- This keeps the feature low-risk and avoids coupling menu UX to the authoritative worker.

## Important Files

- `plans/0016-settings-menu-and-sliders.md`
- `README.md`
- `architecture.md`
- `src/client/menu-state.ts`
- `src/client/player-profile.ts`
- `src/game-app.ts`
- `src/game/player.ts`
- `src/types.ts`
- `src/ui/components.ts`
- `src/ui/menu.ts`
- `src/ui/renderer.ts`
- `src/platform/native.ts`
- `src/client/world-runtime.ts`
- `src/world/constants.ts`
- `tests/menu-state.test.ts`
- `tests/hud.test.ts`
- `tests/player.test.ts`

## Test Plan

- Menu state tests:
  - `SETTINGS` button transitions from play screen to settings screen
  - `BACK` returns to the play screen without losing unrelated menu state
  - reset-to-defaults restores the expected values
- UI component tests:
  - slider hit-testing resolves hover and drag state correctly
  - clicking the track updates to the expected numeric value
  - dragging clamps values at min/max
  - formatted value labels match the normalized slider result
- Runtime behavior tests:
  - FOV changes alter the camera projection input
  - sensitivity changes alter mouse-look scaling
  - render distance changes alter requested chunk radius
- Persistence tests:
  - settings save and reload correctly
  - invalid saved values normalize back into safe ranges
- Manual smoke tests:
  - open `SETTINGS` from the main menu
  - drag each slider and confirm the visible value updates live
  - join a world and confirm the changed FOV and sensitivity are active
  - change render distance while playing and confirm chunk loading responds
  - restart the app and confirm settings persisted

## Assumptions And Defaults

- Use the next plan filename in sequence: `0016-settings-menu-and-sliders.md`.
- Settings are client-local and should not be stored inside world saves.
- The first pass can focus on slider-driven numeric settings plus a small number of simple graphics toggles.
- The reusable slider component should be generic enough to support future options screens without redesigning the UI system again.
