# Live Inventory Item Rendering From Shared Block Visuals

## Summary

Replace the old flat color-swatch inventory visuals with richer block/item presentation that reads more like Minecraft inventory art. The final implementation direction is live screen-space item rendering in the HUD rather than a baked item-icon atlas.

The canonical visual source remains shared block/item render metadata:

- chosen runtime path: render block-backed HUD items live using the same cube-face definitions, atlas textures, and `renderBlockKey` metadata used by dropped items and held items
- fallback direction: keep room for future non-block items to use authored or alternate item visuals without forcing them through fake cube icons

The goal is to keep one visual source across the world, the hand, and the HUD instead of introducing a second baked asset pipeline that can drift.

An important architectural goal is visual consistency: the player-hand item view, dropped item view, and inventory slot view should all come from the same canonical item-visual source even when their transforms differ.

## Key Changes

### Stop treating inventory visuals as plain item colors

- The current UI path in `apps/client/src/ui/hud.ts` renders item slots as colored rectangles using `getItemColor`.
- Replace that with inventory icon rendering driven by item content metadata.
- Keep `color` metadata as a secondary fallback for debug or placeholder use, not the primary inventory art path.

### Prefer reusing existing block render data for placeable items

- Many current items are block-backed and already define `renderBlockKey`.
- Use that metadata to render small cube-style inventory icons that reflect the block’s real atlas tiles.
- Strong recommendation:
  - derive icon appearance from the same content/atlas data used for held-item block rendering
  - avoid introducing a second hand-authored per-item visual source for block-backed items

### Treat hand rendering and inventory icons as two outputs of one visual source

- The local first-person hand item and the inventory/hotbar icon should not evolve as unrelated visual systems.
- Recommended model:
  - one canonical item visual definition
  - hand rendering derives a live 3D in-world or first-person presentation from it
  - inventory rendering derives a UI-friendly icon from it
- Important distinction:
  - reuse the same source data, orientation rules, and atlas inputs
  - do not require the UI to literally run the same live hand-render pipeline
- This keeps:
  - item silhouettes consistent
  - texture usage consistent
  - future changes to item visuals from splitting between HUD and hand views

### Use live HUD item rendering instead of a baked icon atlas

- Do not treat inventory icons as a generated texture asset pipeline.
- Render block-backed items directly in HUD slots using a small screen-space 3D pass.
- Reuse:
  - shared cube-face definitions
  - atlas textures
  - `renderBlockKey`
  - the same block-item mesh construction used by dropped items
- This avoids drift between:
  - dropped items on the ground
  - held items
  - HUD slot visuals

### Define inventory icon source rules in content

- Make icon ownership explicit for each item type.
- Suggested precedence:
  - `renderBlockKey` for block-backed cube-style items
  - future authored `iconKey` or item-specific icon source for tools/food/materials
  - fallback placeholder color if no icon source exists yet
- This keeps future non-block items from being forced into fake cube icons.

### Update HUD/inventory rendering to use live item visuals

- Replace the slot swatch rectangle in `apps/client/src/ui/hud.ts` with dedicated item draw commands.
- Add a UI render path that can draw screen-space cube items without going through the old textured-quad image path.
- Keep stack counts, selection highlights, and layout logic unchanged.
- Preserve a simple fallback direction for future non-block items during development.

## Important Files

- `plans/0034-generated-inventory-icons-and-cube-style-item-rendering.md`
- `apps/client/src/ui/hud.ts`
- `apps/client/src/ui/renderer.ts`
- `apps/client/src/render/renderer.ts`
- `apps/client/src/render/item-overlay.ts`
- `apps/client/src/render/item-mesh.ts`
- `apps/client/src/render/player-renderer.ts`
- `apps/client/src/render/player-model.ts`
- `apps/client/src/render/*`
- `apps/client/src/world/atlas.ts`
- `packages/core/src/world/content-spec.ts`
- `packages/core/src/world/item-render.ts`
- `packages/core/src/world/items.ts`
- `packages/core/src/world/generated/content-registry.ts`
- `README.md`
- `architecture.md`
- `tests/hud.test.ts`
- `tests/atlas.test.ts`

## Suggested Implementation Order

1. Audit the current UI slot rendering and the existing held-item/block render data path.
2. Decide the canonical icon source model:
   use `renderBlockKey` for block-backed items and define the future fallback path for non-block items.
   explicitly define how hand rendering and inventory icons both derive from that source.
3. Implement the shared block-item mesh or face-definition layer so dropped items, held items, and HUD items use the same source data.
4. Update the inventory/hotbar UI renderer to draw live item visuals instead of color swatches.
5. Add validation/tests and document how new items get inventory visuals.

## Decision Notes

### Option A: Live cube-style rendering in UI

- Pros:
  - directly reuses real block textures and orientation
  - no extra generated icon assets for block-backed items
- Cons:
  - more UI rendering complexity
  - likely harder to scale for menus with many visible items

### Chosen Direction

- Use block/item content metadata as the source of truth.
- Keep one canonical item-visual source shared by held items, dropped items, and inventory presentation.
- Render HUD items live in screen space from that source instead of generating `item-icons.png`.
- Keep the architecture open for authored or alternate non-block item visuals later.

## Test Plan

- HUD tests:
  - hotbar/inventory slots emit item render commands instead of pure swatches
  - selected-slot and count rendering still behave the same
- Manual smoke tests:
  - hotbar readability improves for similar-colored blocks
  - inventory still performs acceptably with many visible slots
  - placeable items visually match their held-item/block appearance
  - held, dropped, and HUD visuals stay aligned for the same item

## Assumptions And Defaults

- Use the next plan filename in sequence: `0034-generated-inventory-icons-and-cube-style-item-rendering.md`.
- Current placeable items should not need separate hand-authored inventory art.
- The runtime UI path uses live screen-space cube rendering in slot widgets for block-backed items.
- Future non-block items probably will need either authored icons or a distinct generation path.
