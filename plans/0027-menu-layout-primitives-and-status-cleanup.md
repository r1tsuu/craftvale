# Menu Layout Primitives And Status Cleanup

## Summary

Improve menu and pause-screen UI consistency by introducing small reusable layout primitives for spacing, padding, alignment, and vertical flow instead of hand-placing every label and button. Use that pass to normalize panel gutters and button gaps across the title menu, settings, world/server screens, and pause overlay, and replace the awkward raw `RETURNED TO MENU` label with a clearer transient status treatment.

## Key Changes

### Add a tiny layout toolkit for UI builders

- Create a client-owned layout helper module for menu/HUD composition.
- The goal is not a full browser layout engine. The goal is a small set of predictable primitives that make the current UI feel more like it was built with `display: flex`, `padding`, and `gap`.
- Recommended first-pass primitives:
  - `insetRect(rect, padding)`
  - `stackY(container, itemHeights, gap, align?)`
  - `centerRect(container, width, height)`
  - `anchorRect(container, edge, size, margin)`
  - optional helpers for splitting header/body/footer regions
- Keep the output simple:
  - helpers return plain rects
  - existing `createPanel`, `createLabel`, `createButton`, and `createSlider` stay unchanged
  - builders in `ui/menu.ts` and `ui/hud.ts` use the helpers instead of scattered magic numbers

### Normalize menu shell spacing

- Standardize outer frame margin, inner panel padding, title spacing, subtitle spacing, and content gutters in the main menu shell.
- Replace the current manually tuned offsets with shared spacing tokens or constants.
- Recommended shared spacing model:
  - outer shadow/frame thickness
  - panel padding
  - header gap
  - content gap
  - button stack gap
  - footer/status gap
- This should make title screen, world list, multiplayer, create-world, and settings screens feel like the same system instead of adjacent one-off screens.

### Normalize pause overlay spacing to match the menu shell

- Rebuild the pause panel with the same spacing language as the title menu rather than its current custom offsets.
- Recommended structure:
  - header region: title plus subtitle
  - body region: stacked buttons with consistent gaps
  - optional footer/status region if needed later
- Keep the visual language already established:
  - framed dark panel
  - centered button stack
  - dimmed world background
- Important outcome:
  - pause spacing should look intentionally related to the main menu
  - avoid duplicating the entire menu builder just to reuse layout

### Replace floating raw status text with a reusable status treatment

- The current `RETURNED TO MENU` label reads like debug output and lands in an awkward visual position.
- Introduce a clearer menu-status presentation that can be reused for:
  - returned to menu
  - server saved/deleted
  - world created/deleted
  - validation errors
- Recommended options:
  - a dedicated status line anchored within the menu shell footer
  - a compact banner/toast area with consistent padding and contrast
- Strong recommendation:
  - status text should have one stable home per screen/layout
  - do not append loose labels under arbitrary buttons
  - support both neutral info and error emphasis without changing layout

### Separate persistent instructional copy from transient feedback

- Clarify which labels are part of the screen structure and which are temporary event feedback.
- Good examples of persistent copy:
  - `CHOOSE SINGLEPLAYER OR MULTIPLAYER`
  - `ESC OR BACK TO GAME TO RESUME`
- Good examples of transient feedback:
  - `RETURNED TO MENU`
  - `SAVING SERVER...`
  - `ENTER A SERVER NAME`
- The plan should leave builders with explicit slots for both instead of overloading one content area.

### Reduce magic-number drift across menu builders

- Audit `ui/menu.ts` and `ui/hud.ts` for repeated hard-coded x/y offsets and duplicated button placement math.
- Replace those with shared dimension and spacing constants where the visual intent is the same.
- Keep localized constants where a screen truly needs different proportions, but do not keep multiple slightly different versions of the same button stack spacing by accident.

### Keep the change client-owned

- This is strictly a client UI/layout cleanup.
- No changes should be required in authoritative server logic or shared protocol code.
- Runtime ownership should stay where it is today:
  - `GameApp` owns menu and pause state plus transient status text
  - `ui/menu.ts` and `ui/hud.ts` stay pure builders from view-model data
  - layout helpers remain client-only utilities

### Preserve the lightweight immediate-mode UI architecture

- Do not replace the current UI system with DOM-like retained widgets.
- Do not add CSS parsing or generalized constraint solving.
- The reusable layer should stay intentionally small and composable:
  - rect math helpers
  - spacing tokens
  - pure view builders
- This keeps the codebase understandable while still giving us most of the practical wins of flex/padding/gap-style composition.

## Important Files

- `plans/0027-menu-layout-primitives-and-status-cleanup.md`
- `architecture.md`
- `apps/client/src/game-app.ts`
- `apps/client/src/ui/menu.ts`
- `apps/client/src/ui/hud.ts`
- `apps/client/src/ui/components.ts`
- `apps/client/src/ui/renderer.ts`
- `tests/menu-ui.test.ts`
- `tests/hud.test.ts`
- `tests/menu-state.test.ts`

## Test Plan

- Layout/helper tests:
  - rect layout helpers return expected positions for inset, centered, and vertical-stack arrangements
  - shared stack helpers produce stable button gaps and alignment
- Menu UI tests:
  - main menu and submenu screens still expose the expected components and actions
  - menu screens place status text in the dedicated status region instead of under action buttons
  - settings rows continue to fit within the normalized panel bounds
- Pause UI tests:
  - pause overlay still renders title, subtitle, and the three main buttons
  - pause button spacing stays consistent after layout refactor
  - pause overlay does not render stray transient status text inside the button stack
- Runtime/menu-state tests:
  - returning to menu still records a visible success/info status
  - validation and busy states still surface through the new shared status treatment
- Manual smoke tests:
  - open the main menu and confirm panel padding and button gaps look even
  - open pause and confirm it visually matches the title-menu spacing language
  - exit to menu and confirm the status message appears in a stable, intentional location
  - walk through worlds, multiplayer, and settings screens and confirm there are no clipped labels or uneven gutters

## Assumptions And Defaults

- Use the next plan filename in sequence: `0027-menu-layout-primitives-and-status-cleanup.md`.
- The first pass should target spacing consistency and status presentation, not a full visual redesign.
- Reusable layout helpers should live in the client UI layer and return rects rather than introducing a new retained widget system.
- Transient status messaging should be visually calmer and structurally anchored, even if the exact copy also gets refined during implementation.
