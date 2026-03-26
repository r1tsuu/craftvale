# World Height 256 And Waterline 64

## Summary

Refactor Craftvale from its current single-layer `16` block vertical world into a taller Minecraft-style world with a maximum build/generation height of `256` and a default waterline around Y `64`. This is intentionally a world-architecture milestone, not a terrain-tuning tweak. The current world only simulates one vertical chunk layer, so simply raising biome base heights cannot deliver the feel or scale we want. Plan 37 should introduce multi-layer vertical chunk support, terrain generation across that taller range, a sea level at `64`, and the supporting updates needed in meshing, lighting, replication, persistence, spawn logic, and gameplay assumptions.

The goal is to make vertical space real, not faked: mountains, valleys, caves later, and waterline-based terrain should all exist inside a substantially taller authoritative world.

## Key Changes

### Expand the world from one vertical chunk layer to sixteen

- Move from the current single `WORLD_LAYER_CHUNKS_Y = [0]` model to a full vertical stack covering `256` blocks of height.
- With `CHUNK_SIZE = 16`, that implies chunk layers `0..15` for the first positive-height implementation.
- Strong recommendation:
  - define explicit world vertical bounds in shared constants
  - make chunk-layer iteration data-driven rather than hard-coded to one layer
  - keep the initial implementation non-negative if that simplifies migration and spawn logic

### Define canonical world-height constants

- Add clear shared constants for:
  - total world height `256`
  - chunk layers in Y
  - sea level / waterline `64`
  - top playable/generatable Y bound
- Good defaults:
  - bedrock remains at the bottom
  - waterline becomes a shared terrain-generation constant rather than an ad hoc small-world number

### Rebuild terrain generation for the taller world

- Terrain generation should produce surfaces meaningfully distributed inside the new `0..255` range.
- Good first-pass approach:
  - scale biome base heights upward into the taller space
  - preserve biome personality while increasing absolute elevation headroom
  - clamp terrain against the new world bounds rather than the current `CHUNK_SIZE - 2`
- Strong recommendation:
  - separate “terrain shape” from “current small-world clamp assumptions”
  - review tree placement ceilings, spawn position calculations, and any hard-coded assumptions about `y < 16`

### Set a Minecraft-style sea level at Y 64

- Replace the current low-world waterline with a canonical sea level around Y `64`.
- Terrain lower than that level should fill with generated water as part of worldgen.
- Important consequence:
  - shorelines, plains, and low basins should now read relative to a real sea level rather than to a compressed 16-block sandbox height

### Update chunk loading, storage, and replication for vertical worlds

- Any code that currently assumes only one Y chunk layer must be audited.
- Important areas:
  - chunk iteration and active-area loading
  - startup pregeneration
  - save/load directory layout and coverage
  - join payloads and chunk request patterns
  - client missing-chunk requests around player position
- Strong recommendation:
  - keep the protocol shape stable where possible
  - but allow chunk request breadth and startup generation to become vertically aware

### Update meshing and rendering to handle stacked Y chunks normally

- The renderer already consumes chunk meshes by coordinate, so the main requirement is making sure vertically stacked chunks are generated, requested, loaded, and culled correctly.
- Good first-pass expectations:
  - visible terrain should render correctly above and below the player
  - chunk visibility logic should include Y range, not just X/Z distance assumptions
  - water rendering should continue working at the new sea level without special cases

### Make lighting operate correctly across vertical chunk stacks

- The lighting system already reasons about chunk neighborhoods and sky light, but a taller world makes vertical propagation materially more important.
- Important checks:
  - skylight from open sky down through upper layers
  - block-light propagation across vertical chunk borders
  - relighting around mutations near chunk-layer boundaries
- Strong recommendation:
  - audit for assumptions that only `y = 0` chunks exist
  - treat this as a correctness pass, not a new lighting-feature milestone

### Update player spawn and gameplay expectations

- Spawn positions should be recomputed against the taller terrain range.
- The player should spawn near the generated surface, not near a hard-coded small-world height assumption.
- Good first-pass behavior:
  - derive spawn Y from terrain height plus a small standing offset
  - keep player physics unchanged unless a taller world reveals a concrete issue

### Preserve water simplicity for now

- This plan changes world height and sea level, not water behavior scope.
- Water should remain:
  - static
  - server-authoritative
  - non-flowing
  - simple for player physics
- That keeps the milestone focused on vertical-world architecture.

### Plan for save compatibility deliberately

- Moving from one vertical layer to sixteen is a meaningful world-format shift.
- Recommended first-pass stance:
  - do not promise transparent backward compatibility for old generated worlds unless we intentionally build migration
  - prefer explicit storage/version bumps if needed
  - clearly document whether existing worlds need regeneration

## Important Files

- `plans/0037-world-height-256-and-waterline-64.md`
- `README.md`
- `architecture.md`
- `packages/core/src/world/constants.ts`
- `packages/core/src/world/terrain.ts`
- `packages/core/src/world/biomes.ts`
- `packages/core/src/world/world.ts`
- `packages/core/src/world/chunk.ts`
- `packages/core/src/world/chunk-coords.ts`
- `packages/core/src/world/mesher.ts`
- `packages/core/src/server/authoritative-world.ts`
- `packages/core/src/server/lighting-system.ts`
- `packages/core/src/server/world-storage.ts`
- `packages/core/src/server/runtime.ts`
- `apps/client/src/client/world-runtime.ts`
- `apps/client/src/game-app.ts`
- `apps/client/src/render/renderer.ts`
- `tests/terrain.test.ts`
- `tests/world.test.ts`
- `tests/authoritative-world.test.ts`
- `tests/client-server.test.ts`

## Suggested Implementation Order

1. Add shared constants for total world height, vertical chunk-layer range, and sea level `64`.
2. Refactor world/chunk iteration helpers so Y layers are no longer hard-coded to one entry.
3. Rework terrain generation and terrain-height clamping for a `256`-high world.
4. Update startup pregeneration, chunk requests, and client/server chunk loading to include vertical layers.
5. Audit lighting and relighting for vertical chunk-neighborhood correctness.
6. Update spawn logic and any player/world assumptions tied to the old `0..15` height range.
7. Rebaseline tests and documentation around the new world scale.

## Test Plan

- Terrain tests:
  - generated heights occupy a sensible range within `0..255`
  - sea level is `64`
  - different biomes still produce distinct elevation profiles
- World/chunk tests:
  - chunk coordinate conversion works across many Y layers
  - active-area loading includes multiple Y chunk layers
  - cross-layer block reads/writes work at chunk boundaries
- Lighting tests:
  - skylight propagates correctly from upper layers downward
  - vertical chunk-border relighting remains correct
- Persistence/network tests:
  - vertically stacked chunks save/load correctly
  - client/server chunk delivery works above Y `15`
- Manual smoke tests:
  - spawn on a taller world near the generated surface
  - verify waterlines around Y `64`
  - confirm mountains and valleys have meaningful headroom

## Assumptions And Defaults

- Use the next plan filename in sequence: `0037-world-height-256-and-waterline-64.md`.
- The target maximum world height is `256`.
- The target first-pass sea level is `64`.
- Water remains static and simple during this milestone.
- This is a world-architecture refactor, not a small terrain-bias tweak.
