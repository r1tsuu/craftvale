# Minecraft-Style Menu Flow

## Summary
Rework the main menu so it feels closer to Minecraft's structure and pacing instead of showing world selection and world creation controls all at once. The new flow should have two clear screens:

1. a top-level play screen
2. a worlds screen with the world list and a dedicated create-world action

The goal is to make the UI easier to scan, more recognizable, and more extensible for future menu work without changing the underlying worker-backed world management model.

## Key Changes

### Split the current combined menu into explicit screens
- Replace the current single `buildMainMenu(...)` layout with a small screen-based menu flow.
- Add menu screens such as:
  - `play`
  - `worlds`
  - optionally `create-world` if the creation form should become its own follow-up screen instead of living inline on the worlds screen
- Keep the menu state explicit so `GameApp` can switch screens without relying on layout-specific button wiring.

### Screen 1: Play screen
- Make the first menu screen a simple Minecraft-like landing screen focused on primary actions.
- The main action should be `Play`, which moves the user to the worlds screen.
- Keep `Quit` available from this screen.
- Preserve the current stylized voxel backdrop, but tune panel sizing, spacing, and button hierarchy so the menu reads more like a game front door than a tool panel.
- Keep this screen intentionally sparse. It should not show the full world list or create form.

### Screen 2: Worlds screen
- Move the world list and world-management actions onto a dedicated worlds screen.
- Show:
  - the saved-world list
  - the selected world
  - a `Play Selected World` action
  - a `Create World` action
  - refresh/back controls
- Keep delete support, but place it as a secondary action so the main path stays focused on playing.
- If the world list grows, the layout should still have a clear list area rather than mixing list rows and creation fields in the same visual stack.

### Create-world flow
- Remove the always-visible create-world inputs from the default menu.
- Trigger world creation from the dedicated `Create World` button on the worlds screen.
- Recommended default:
  - selecting `Create World` opens a separate create-world screen with name/seed fields and confirm/cancel buttons
- Acceptable simpler fallback:
  - selecting `Create World` expands or swaps the worlds screen into creation mode
- In either case, creation should feel like a deliberate step, not a permanently exposed side form.

### Extend menu state for screen navigation
- Update `src/client/menu-state.ts` so menu state tracks:
  - active screen
  - focused field within the create-world screen or mode
  - selected world
  - busy/status text
- Keep screen transitions pure and explicit through menu actions such as:
  - `open-play`
  - `open-worlds`
  - `open-create-world`
  - `back-to-play`
  - `back-to-worlds`
- Avoid baking navigation logic into ad hoc string parsing inside `GameApp`.

### Refactor menu composition in `src/ui/menu.ts`
- Break the current single builder into smaller screen builders, for example:
  - `buildPlayMenu(...)`
  - `buildWorldsMenu(...)`
  - `buildCreateWorldMenu(...)`
- Share common backdrop and frame helpers so the screens stay visually consistent.
- Keep the resulting UI data declarative so the existing UI evaluation/rendering model still works.

### Improve visual language toward Minecraft-like structure
- Make the UI feel closer to Minecraft without trying to clone it exactly.
- Emphasize:
  - centered stacked buttons
  - stronger hierarchy between primary and secondary actions
  - clearer framed panels around list content
  - less dashboard-like density
- Keep the existing custom voxel backdrop direction, but simplify the foreground layout so buttons and list panels do most of the work.

### UI component support
- The current UI primitives are enough for the basic screen split, but this refactor may benefit from small additions such as:
  - disabled button styling
  - secondary button styling
  - panel title helpers
  - optional list-row treatment for selected worlds
- Only add new primitives if they materially simplify the new screen layouts.

### `GameApp` menu handling
- Update `src/game-app.ts` to drive the new screen flow.
- Menu actions should become screen-aware:
  - opening the worlds screen should sync or reuse world-list data
  - joining still goes through the authoritative worker request path
  - create/delete/refresh should preserve sensible selection and status behavior when returning between screens
- Keep `Enter` behavior scoped to the create-world confirmation path rather than making it ambiguous on every screen.

### Preserve current gameplay/runtime boundaries
- This plan changes menu UX, not ownership boundaries.
- World listing, creation, deletion, joining, saving, and inventory/world runtime behavior should remain under the same client/server split.
- The UI refactor should not reintroduce global app state or direct client-side world mutation.

## Important Files
- `src/game-app.ts`
- `src/client/menu-state.ts`
- `src/ui/menu.ts`
- `src/ui/components.ts`
- `src/ui/renderer.ts`

## Test Plan
- Menu-state tests:
  - screen transitions are pure and deterministic
  - world selection stays stable when refreshing worlds
  - create-world focus/typing only applies on the create flow
- UI/menu tests:
  - play screen exposes the expected primary actions
  - worlds screen exposes world rows plus create/play/back actions
  - create-world screen or mode exposes confirm/cancel controls and field focus
- App/runtime tests:
  - pressing `Play` from the landing screen reaches the worlds screen
  - joining a selected world still enters gameplay
  - create/delete/refresh continue to work through the worker-backed server
- Manual smoke test:
  - menu opens on the play screen
  - user can navigate to worlds
  - user can create a world from the dedicated button
  - user can return/back out cleanly

## Assumptions And Defaults
- This pass is focused on structure and feel, not pixel-perfect Minecraft imitation.
- The current background style can stay; the main UX win comes from splitting responsibilities across screens.
- The preferred default is a three-screen flow:
  - play
  - worlds
  - create-world
- If implementation complexity needs to stay lower, the create-world step can be a worlds sub-mode as long as the dedicated create action still exists.
- Use the next plan filename in sequence: `0008-minecraft-style-menu-flow.md`.
