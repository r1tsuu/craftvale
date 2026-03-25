# Bedrock Layer And Creative-Only Bedrock Breaking

## Summary
Add a real `bedrock` block type and generate a dedicated bedrock floor at the bottom of the world instead of relying on ordinary deep stone. Bedrock should behave as an unbreakable world boundary during normal survival play, while still allowing creative mode players to remove it intentionally. The first pass should keep this scoped to block definitions, terrain generation, atlas content, and authoritative mutation rules so the behavior is consistent across rendering, world saves, and gameplay.

## Key Changes

### Add bedrock as a first-class block
- Introduce a new `BlockId` for `bedrock` instead of overloading stone or using a terrain-only special case.
- Give it its own block definition:
  - solid and collidable
  - opaque/full occlusion
  - not collectible in survival
  - explicitly non-breakable by default
- Prefer a dedicated `breakable` or similarly named block-property flag rather than inferring breakability from whether a block drops an item.
- Bedrock should not be part of the normal placeable hotbar/item set in this phase.

### Add a dedicated bedrock texture tile
- Reserve the remaining free atlas slot for a `bedrock` tile.
- Update the shared atlas mapping and the atlas-generation script together so the client renderer and generated PNG stay aligned.
- Keep the first texture simple and readable:
  - darker than stone
  - visibly mottled/cracked so it reads as a special boundary material

### Generate a bedrock level at the bottom of the world
- Add a hard bedrock floor at `worldY === 0`.
- Keep the existing biome-driven surface/filler/deep block logic above that floor.
- The resulting column behavior should be:
  - `y = 0` is always bedrock
  - `y > 0` follows the current biome surface/filler/deep terrain rules
- This should apply consistently to all generated chunks, not just spawn or chunk `(0, 0, 0)`.

### Make bedrock non-breakable in survival
- Server-authoritative block mutation should reject survival attempts to break bedrock.
- Expected survival behavior:
  - no block change
  - no dropped item
  - no chunk revision/update
  - no inventory side effects
- Keep this decision on the server so local worker and future dedicated-server play behave identically.

### Allow creative mode to break bedrock
- Creative players should still be able to remove bedrock intentionally.
- Recommended rule:
  - if the target block is bedrock and the acting player is in creative mode, allow mutation to air
  - no dropped item is spawned unless we intentionally add a bedrock item later
- This keeps bedrock useful as a survival boundary without making creative building/editing frustrating.

### Keep item and inventory behavior narrow
- Bedrock should not be added to the default hotbar in this first pass.
- Bedrock should not become placeable from normal inventory paths unless we explicitly choose that later.
- If we later want admin/debug placement, that should be a separate scoped change rather than piggybacking on this one.

### Preserve rendering and meshing expectations
- Bedrock should mesh like any other opaque full block.
- Adjacent bedrock faces should cull normally.
- Bedrock should use the same texture on all faces in the first pass unless we later choose a special top/bottom treatment.

## Important Files
- `packages/core/src/types.ts`
- `packages/core/src/world/blocks.ts`
- `packages/core/src/world/atlas.ts`
- `packages/core/src/world/terrain.ts`
- `packages/core/src/server/authoritative-world.ts`
- `packages/core/src/world/items.ts`
- `apps/cli/src/generate-voxel-atlas.ts`
- `apps/client/assets/textures/voxel-atlas.png`
- `tests/terrain.test.ts`
- `tests/mesher.test.ts`
- `tests/atlas.test.ts`
- `tests/authoritative-world.test.ts`

## Test Plan
- Block-definition tests:
  - bedrock is registered as a solid opaque block
  - bedrock reports as non-breakable
  - bedrock does not expose a normal dropped item in survival
- Terrain tests:
  - generated chunks always place bedrock at `worldY === 0`
  - generated terrain above `y = 0` still follows the current biome rules
- Meshing/render tests:
  - bedrock uses the bedrock atlas tile on every face
  - bedrock renders in the opaque pass
- Atlas tests:
  - `AtlasTiles.bedrock` points at the expected free tile slot
  - the bedrock tile is fully opaque
- Authoritative mutation tests:
  - survival breaking of bedrock is rejected with no chunk change and no drop
  - creative breaking of bedrock succeeds and clears the block
  - creative breaking of bedrock still does not spawn a survival drop item
- Smoke test:
  - start a world, confirm the bottom layer is bedrock, and verify survival vs creative breaking behavior manually

## Assumptions And Defaults
- Use the next plan filename in sequence: `0026-bedrock-layer-and-creative-bedrock-breaking.md`.
- Bedrock is a world-boundary block first, not a standard player-building material.
- Survival should not be able to destroy bedrock.
- Creative mode should be able to destroy bedrock for editing/debugging convenience.
- Bedrock will not be added to the normal hotbar or item registry in this phase unless scope explicitly expands later.
