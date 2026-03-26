# Caves And Configurable Ore Generation

## Summary

Add underground cave systems and ore generation to Craftvale's deterministic
worldgen. Caves should be able to appear as fully enclosed underground systems
or open naturally to the surface through terrain breaks, ravines, or hillside
entrances. Ore generation should be driven by one reusable configuration model
so each ore type can define its own preferred height range, vein frequency,
and vein size without hard-coding bespoke logic per ore.

The first pass should stay intentionally simple:

- caves are generated deterministically during terrain population
- no separate cave biome system yet
- ores only generate inside solid terrain, not in air or water
- ore placement is data-driven from a shared config table
- the system must stay chunk-order safe under the current column-chunk world
  model

## Goals

- Make underground exploration interesting with recognizable cave networks.
- Allow both closed cave pockets and caves that open to the outside world.
- Add core progression ores:
  - coal
  - iron
  - gold
  - diamond
- Centralize ore-generation rules in one configuration structure instead of
  scattering constants through terrain code.
- Keep generation deterministic for a given world seed and chunk coordinate.

## Non-Goals

- No fluid-driven cave carving or lava generation in the first pass.
- No complex cave biomes, dripstone, underground vegetation, or structure
  generation yet.
- No tool-tier progression or furnace/smelting implementation as part of this
  plan.
- No backward-compatibility layer for worlds generated without caves or ores.

## Key Changes

### Add cave carving as a separate generation phase

- Terrain generation should first establish the solid landmass for the chunk
  column, including surface, filler, stone, water, and trees.
- Cave carving should run after base terrain population and before final
  decoration that depends on solid ground stability.
- Strong recommendation:
  - treat cave carving as a dedicated pass over the generated chunk column
  - keep its inputs only:
    - world seed
    - world coordinates
    - current block state

### Support both enclosed caves and surface openings

- Cave noise should be capable of carving fully underground pockets and tunnels.
- The same carving logic should be allowed to intersect the terrain surface,
  which naturally creates open cave mouths and exposed cliffside holes.
- Important behavior:
  - not every cave should breach the surface
  - the surface should still remain broadly readable and traversable
- Strong recommendation:
  - bias cave density downward with depth
  - keep the near-surface carve threshold stricter so surface openings exist
    but do not dominate the terrain

### Introduce dedicated ore blocks and items

- Add at least these ore-bearing blocks:
  - coal ore
  - iron ore
  - gold ore
  - diamond ore
- If the current item/block model expects block-backed items, each ore block
  should also have the corresponding placeable item entry unless gameplay says
  otherwise.
- Atlas/content generation should gain the required textures and content-spec
  entries.

### Use one universal ore-generation configuration model

- Ore generation should not be hand-coded separately for each ore.
- Define one shared ore config structure with fields such as:
  - `blockKey`
  - `minY`
  - `maxY`
  - `attemptsPerChunk`
  - `veinSizeMin`
  - `veinSizeMax`
  - optional rarity or discard bias tuning
- This config should be the only authored place that controls:
  - how common the ore is
  - where vertically it can appear
  - how large one finding can be
- Strong recommendation:
  - keep the config authored near other world/content definitions, not buried in
    terrain internals

### Generate ore veins, not isolated single blocks

- Ores should appear in small clusters or veins rather than as random isolated
  blocks everywhere.
- A first-pass approach can use seeded vein anchors plus a radius/walk-based
  fill, as long as it stays deterministic and bounded.
- Important rules:
  - ores should only replace eligible host blocks such as stone
  - ores should respect their configured height range
  - vein placement should not depend on generation order of neighboring chunks

### Keep caves and ore generation chunk-order safe

- With column chunks, generation must still remain deterministic regardless of
  load order.
- Cave carving may sample neighboring world positions, but writes during chunk
  generation should only affect the current chunk column.
- Ore generation must follow the same rule.
- Strong recommendation:
  - derive cave and ore decisions from world-space coordinates plus seed instead
    of any mutable global state

### Keep water handling simple in cave interiors

- The current world already has static water generation.
- First-pass cave carving should avoid introducing a full flood-fill fluid
  system.
- Reasonable default:
  - if carving intersects blocks below sea level, existing water behavior may
    leave some flooded cave entrances or shoreline cavities
  - fully simulating underground water spread is out of scope for this plan

### Preserve readable meshing and lighting behavior

- Cave openings and underground spaces will materially increase visible
  interior faces.
- Meshing should continue to emit correct surfaces for carved air pockets and
  ore-exposed stone walls.
- Lighting should remain consistent for:
  - skylight entering from cave openings
  - dark enclosed underground cavities
  - emissive blocks such as glowstone if placed by the player later

## Important Files

- `plans/0039-caves-and-configurable-ore-generation.md`
- `README.md`
- `architecture.md`
- `packages/core/src/world/content-spec.ts`
- `packages/core/src/world/generated/content-registry.ts`
- `packages/core/src/world/blocks.ts`
- `packages/core/src/world/biomes.ts`
- `packages/core/src/world/terrain.ts`
- `packages/core/src/world/constants.ts`
- `packages/core/src/world/mesher.ts`
- `packages/core/src/server/lighting-system.ts`
- `apps/cli/src/default-voxel-tile-sources.ts`
- `tests/terrain.test.ts`
- `tests/mesher.test.ts`
- `tests/atlas.test.ts`
- `tests/content-registry-generator.test.ts`

## Suggested Implementation Order

1. Add ore block/item content entries and source textures.
2. Define a shared ore-generation config structure and authored defaults for
   coal, iron, gold, and diamond.
3. Add a cave-carving pass to terrain generation for chunk columns.
4. Add a deterministic ore-vein placement pass that runs after cave carving and
   only replaces eligible host blocks.
5. Revisit surface/tree decoration interactions where cave openings may break
   the ground.
6. Rebaseline meshing and lighting assumptions for newly exposed underground
   geometry.
7. Update docs to describe cave generation and ore configuration.

## Test Plan

- Terrain tests:
  - cave carving is deterministic for the same seed and chunk
  - some seeds produce enclosed caves and some exposed cave openings within a
    broader sample area
  - caves do not erase bedrock or exceed world bounds
- Ore tests:
  - each ore only appears within its configured Y range
  - each ore appears with non-zero frequency across a representative search area
  - ore blocks only replace valid host blocks
  - vein sizes stay within configured expectations
- Meshing/lighting tests:
  - carved caves produce visible interior faces
  - skylight reaches open cave entrances but not sealed caves
- Content/tooling tests:
  - generated content ids/registries include the new ore blocks/items
  - generated atlas/tile-source outputs stay in sync with the new textures
- Manual smoke tests:
  - dig downward and find cave spaces underground
  - confirm some caves open naturally to the surface
  - confirm coal/iron/gold/diamond distribution feels distinct by depth

## Assumptions And Defaults

- Use the next plan filename in sequence:
  `0039-caves-and-configurable-ore-generation.md`.
- The current column-chunk world model from plan 38 remains in place.
- Sea level remains `64`.
- Ore configuration is authored once and consumed by terrain generation.
- First-pass cave generation prioritizes determinism and readability over
  simulation complexity.
