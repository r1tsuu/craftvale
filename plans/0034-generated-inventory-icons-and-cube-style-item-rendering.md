# Generated Inventory Icons And Cube-Style Item Rendering

## Summary
Replace the current flat color-swatch inventory visuals with richer block/item icons that read more like Minecraft inventory art. Today the hotbar and inventory UI mostly rely on `getItemColor`, which is cheap but too abstract once the world now has authored block textures, generated atlases, held-item rendering, and stable content registries.

This plan adds a baked inventory-icon pipeline that reuses existing block/item render data as its source:

- chosen runtime path: generate concrete inventory icon textures ahead of time
- canonical visual source: reuse existing block/item render metadata so placeable block-backed items still appear as small cube-style icons

The goal is to move the inventory UI from placeholder swatches to recognizable content art without locking the project into one inflexible rendering strategy.

An important architectural goal is visual consistency: the player-hand item view and the inventory icon view should come from the same canonical item-visual source even if they do not use the exact same runtime rendering path.

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

### Support generated inventory textures as a build artifact
- Add a generation path that outputs one baked inventory icon texture per item.
- This is the chosen runtime direction because the UI wants simple textured quads instead of live miniature cube rendering.
- The generation path should still derive current block-backed item icons from shared block/item visual metadata rather than introducing separate hand-authored item art by default.
- Good target shape:
  - one generated icon PNG per item key or item id
  - optional combined item-icon atlas for runtime UI use
  - checked-in generated metadata if needed for UV lookup

### Keep a shared visual source even with baked icons
- Do not force every placeable block item to hand-author a separate 2D icon if the cube/block render can be reused deterministically.
- Recommended model:
  - author or derive logical icon inputs from content data
  - generate runtime icon textures or an atlas for UI
  - keep cube-style item appearance as the visual source for baked block-backed item icons

### Define inventory icon source rules in content
- Make icon ownership explicit for each item type.
- Suggested precedence:
  - `renderBlockKey` for block-backed cube-style items
  - future authored `iconKey` or item-specific icon source for tools/food/materials
  - fallback placeholder color if no icon source exists yet
- This keeps future non-block items from being forced into fake cube icons.

### Add CLI generation support if icons are baked
- If the chosen runtime path uses baked textures, generation should live under `apps/cli`.
- Likely responsibilities:
  - render or compose per-item icon images from atlas/content inputs
  - validate every item has a resolvable icon source
  - optionally pack icons into an item-icon atlas for UI

### Update HUD/inventory rendering to use item icons
- Replace the slot swatch rectangle in `apps/client/src/ui/hud.ts` with actual icon rendering.
- Keep stack counts, selection highlights, and layout logic unchanged.
- Preserve a simple fallback path for missing icons during development.

## Important Files
- `plans/0034-generated-inventory-icons-and-cube-style-item-rendering.md`
- `apps/client/src/ui/hud.ts`
- `apps/client/src/render/renderer.ts`
- `apps/client/src/render/player-renderer.ts`
- `apps/client/src/render/player-model.ts`
- `apps/client/src/render/*`
- `apps/client/src/world/atlas.ts`
- `apps/cli/src/*`
- `packages/core/src/world/content-spec.ts`
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
3. Implement the first-pass icon generation or icon derivation layer.
4. Update the inventory/hotbar UI renderer to draw icons instead of color swatches.
5. Add validation/tests and document how new items get inventory visuals.

## Decision Notes

### Option A: Live cube-style rendering in UI
- Pros:
  - directly reuses real block textures and orientation
  - no extra generated icon assets for block-backed items
- Cons:
  - more UI rendering complexity
  - likely harder to scale for menus with many visible items

### Option B: Generated inventory icon textures
- Pros:
  - simple UI rendering path
  - works naturally for both block items and future non-block items
  - easier to reuse across menus, crafting, and tooltips
- Cons:
  - needs a build/generation pipeline
  - can drift visually if generated from a different source than the block renderer

### Chosen Direction
- Use block/item content metadata as the source of truth.
- Keep one canonical item-visual source shared by both hand rendering and inventory presentation.
- Generate baked UI-friendly item icons from that source, using `renderBlockKey` to derive cube-style visuals for placeable block-backed items.
- Keep the architecture open for authored non-block item icons later.

## Test Plan
- HUD tests:
  - hotbar/inventory slots render item icons instead of pure swatches
  - selected-slot and count rendering still behave the same
- Asset/tests:
  - every item resolves to an icon source
  - generated icon outputs stay in sync with the authored content spec
- Manual smoke tests:
  - hotbar readability improves for similar-colored blocks
  - inventory still performs acceptably with many visible slots
  - placeable items visually match their held-item/block appearance
  - hand-held visuals and inventory icons stay visually aligned for the same item

## Assumptions And Defaults
- Use the next plan filename in sequence: `0034-generated-inventory-icons-and-cube-style-item-rendering.md`.
- Current placeable items should not need separate hand-authored inventory art.
- The runtime UI path will use baked icons rather than live 3D cube rendering in slot widgets.
- Future non-block items probably will need either authored icons or a distinct generation path.
