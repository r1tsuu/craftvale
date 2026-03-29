# Player Model In Inventory UI

## Summary

Replace the large `INVENTORY` label area in the player inventory screen with a
small rendered preview of the current player model, similar to Minecraft.

This is a UI/rendering follow-up to the inventory crafting work from
`0051-crafting-system.md`. The goal is to make the player inventory screen feel
more like the Minecraft layout:

- no large `INVENTORY` title text
- no extra empty dead space in the top-left panel area
- a dedicated player preview occupying that space
- the preview should be scaled modestly so it reads clearly without dominating
  the screen

## Goals

- Remove the `INVENTORY` title from the player inventory overlay.
- Render the current local player model in the top-left inventory area.
- Keep the preview visually stable and small enough to fit the panel cleanly.
- Reuse the existing player rendering/model code rather than creating a separate
  duplicated model implementation.
- Let the inventory preview respond to mouse position with Minecraft-style
  preview rotation.
- Keep the crafting and slot interaction behavior unchanged.

## Proposed Design

### 1. Treat the inventory preview as a dedicated render target area

Instead of building the player preview as HUD rectangles, add a dedicated
inventory-preview region to the play HUD state.

Recommended HUD output:

- inventory overlay still builds the panel and slot hotspots
- HUD additionally exposes a rect for the player preview area
- main renderer draws the player model into that rect after the world pass and
  before or alongside the UI overlay pass

This keeps the actual model preview in the renderer, not in UI-label logic.

### 2. Reuse the existing player model renderer

The preview should come from the same player-model code used for remote players
and first-person hand composition where possible.

Preferred approach:

- reuse `player-model.ts` / `player-renderer.ts` geometry or draw helpers
- render only the local player snapshot
- use a preview-only camera transform rather than world-space placement

The inventory preview should not require a second gameplay entity type or a fake
replicated player object.

### 3. Add a small preview camera/layout preset

The preview should use a fixed presentation:

- front-facing baseline pose with mouse-driven look offsets
- centered in the top-left empty inventory area
- scaled down compared with Minecraft’s full preview so it does not crowd the UI
- stable lighting, not dependent on world lighting behind the UI

Recommended first pass:

- neutral fixed light
- mouse position adjusts yaw/pitch within a clamped range
- default resting pose still looks good when the mouse is not moving

### 4. Keep the inventory geometry aligned around the preview

The player inventory overlay should reserve a clean left preview column and keep:

- crafting `2x2 -> 1` in the upper-right
- main inventory grid below
- hotbar at the bottom

This means the top-left preview area becomes a real layout region, not just
leftover padding.

### 5. Keep crafting-table UI unchanged for now

This plan is for the player inventory screen only.

The crafting-table container screen may later adopt a related visual language,
but `0052` should not require adding a player preview there unless explicitly
wanted afterward.

## Important Files

- `plans/0052-player-model-in-inventory-ui.md`
- `apps/client/src/ui/hud.ts`
- `apps/client/src/app/play-controller.ts`
- `apps/client/src/app/game-app.ts`
- `apps/client/src/render/renderer.ts`
- `apps/client/src/render/player-model.ts`
- `apps/client/src/render/player-renderer.ts`
- `apps/client/src/game/player.ts`
- `apps/client/src/app/world-runtime.ts`
- `tests/hud.test.ts`
- `tests/player-render.test.ts`

## Test Plan

- HUD tests:
  - inventory overlay no longer emits the large `INVENTORY` title
  - inventory overlay exposes or implies a dedicated player preview region
- Render tests:
  - preview rendering path can draw the local player model without depending on
    world-space player visibility logic
- Manual:
  - open inventory
  - confirm player preview appears in the top-left area
  - confirm the preview is not oversized
  - confirm crafting `2x2`, main inventory, and hotbar layout still align cleanly
  - confirm cursor/slot interactions still work normally

## Non-Goals

- Character equipment slots
- Armor rendering differences
- Animation polish specific to the inventory preview
- Changing the crafting-table container screen in the same pass
