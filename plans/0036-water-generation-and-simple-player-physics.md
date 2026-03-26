# Water Generation And Simple Player Physics

## Summary

Add a first-pass water block and world generation rules so Craftvale gets lakes, shorelines, and flooded low areas without turning this milestone into a full fluid simulation or swimming overhaul. The key constraint is to keep player physics simple: water should not require buoyancy, currents, complex drag, ladder-like movement rules, or a second movement controller. The first version should focus on static generated water placed by terrain generation, authoritative replication/storage like other blocks, and a rendering path that makes water readable in the world while letting the existing player controller remain mostly unchanged.

The intent is to make the world feel more alive and biome-rich without destabilizing the current gameplay loop or input/physics model.

## Key Changes

### Add a real water block and corresponding content entries

- Introduce `water` as authored block content in `content-spec.ts`.
- Good first-pass block properties:
  - not collectible
  - not breakable in normal survival if that simplifies the first pass, or breakable back to air if that better matches current sandbox expectations
  - non-collidable for player/block traversal
  - non-occluding
  - rendered in a dedicated transparent or water-specific pass
- Strong recommendation:
  - do not introduce a water inventory item in v1 unless it becomes necessary for debugging or creative placement
  - keep water primarily worldgen-authored at first

### Generate static water as part of terrain generation

- Extend terrain generation so low-elevation areas fill with water up to a chosen waterline.
- Good first-pass approach:
  - define a global sea level or waterline height
  - generate terrain as normal
  - fill exposed air below that waterline with water
  - allow lakes or coast-like shapes to appear naturally from terrain height variation
- Strong recommendation:
  - keep water generation deterministic from the world seed
  - make it a pure terrain-generation concern, not a post-load mutation pass
  - avoid chunk-order-sensitive filling rules

### Keep water static in v1

- Water should not flow, spread, update neighbors, or perform simulation ticks in this plan.
- This means:
  - no source blocks vs flowing blocks
  - no fluid levels
  - no waterfall propagation
  - no block updates caused by removing adjacent terrain
- Reasoning:
  - static water gives the visual/worldgen benefit immediately
  - it avoids introducing a large authoritative simulation cost before the block/mutation model is ready for it
  - it keeps saves, networking, and chunk mutation semantics simple

### Keep player physics intentionally simple

- The current player controller should remain fundamentally the same.
- Recommended first-pass behavior:
  - water is non-solid, so the player can move through it like open space
  - gravity still applies normally
  - jump remains the same input path
  - no buoyancy, no swim mode, no current forces, no breath system
- Optional lightweight concessions if needed for feel:
  - a very small movement-speed dampening while inside water
  - a very small fall-speed cap while inside water
- Strong recommendation:
  - only add those if the raw current movement feels obviously broken
  - otherwise prefer zero special-case player physics for v1
- Explicitly out of scope:
  - swimming strokes
  - treading water
  - underwater camera distortion
  - drowning
  - fluid push forces

### Make water rendering readable without rewriting the renderer

- Water needs to read as water rather than as an opaque solid cube.
- Good first-pass rendering options:
  - a dedicated translucent render pass
  - or a constrained water-specific pass that draws visible water faces after opaque terrain
- Strong recommendation:
  - do not try to make the existing cutout pass pretend to be translucent water
  - keep leaves on cutout and give water its own simpler treatment if needed
- Good first-pass visuals:
  - blue-tinted semi-transparent faces
  - top faces clearly readable from above
  - side faces visible through shallow shorelines
- Keep the shader work disciplined:
  - no reflections/refractions required
  - no wave simulation required
  - no animated normals required unless a tiny UV/color shimmer is nearly free

### Ensure meshing and occlusion rules fit non-solid water

- Meshing rules will need to treat water differently from opaque terrain.
- Important first-pass expectations:
  - water faces against air should render
  - water faces against solid terrain should render where visible
  - internal faces between adjacent water voxels should usually be culled
  - opaque terrain next to water should not disappear incorrectly
- Strong recommendation:
  - add explicit block metadata for water render behavior rather than scattering `blockId === water` checks everywhere
  - shape the mesher so later translucent block families could reuse the same pattern

### Keep storage, replication, and authority aligned with normal blocks

- Generated water should be stored in chunks exactly like any other generated block.
- No special replication model is needed if water is static block data.
- This means:
  - server/world generation remains authoritative
  - clients receive water through normal chunk payloads
  - chunk persistence already covers explored/generated water naturally
- Strong recommendation:
  - do not introduce client-only procedural water decoration
  - do not simulate water locally on the client

### Define clear block interaction rules up front

- The plan should choose one simple interaction model and keep it consistent.
- Recommended first-pass rule:
  - survival cannot collect water as an item
  - placing a normal solid block into water simply replaces that water cell
  - breaking surrounding terrain does not cause water to flow into the space
- This keeps water compatible with the current block mutation architecture without requiring fluid updates.

### Keep biome integration simple but leave room to grow

- Water generation should make current worlds feel more varied even before a dedicated biome-water overhaul.
- Good first-pass outcome:
  - a shared waterline works across plains, scrub, forest, and highlands
  - terrain naturally determines where water appears
- Future expansion hooks:
  - biome-specific waterline adjustments
  - swamp-like lowland generation
  - rivers
  - frozen water variants
- These should remain out of scope for this plan unless the current terrain shaping makes water placement obviously unusable.

## Important Files

- `plans/0036-water-generation-and-simple-player-physics.md`
- `README.md`
- `architecture.md`
- `packages/core/src/world/content-spec.ts`
- `packages/core/src/world/generated/*`
- `packages/core/src/world/terrain.ts`
- `packages/core/src/world/biomes.ts`
- `packages/core/src/world/blocks.ts`
- `packages/core/src/world/chunk.ts`
- `packages/core/src/world/mesher.ts`
- `apps/client/src/render/renderer.ts`
- `apps/client/assets/shaders/*`
- `apps/client/src/game/player.ts`
- `tests/terrain.test.ts`
- `tests/mesher.test.ts`
- `tests/world.test.ts`
- `tests/player.test.ts`

## Suggested Implementation Order

1. Add `water` to authored/generated block content with the metadata needed for non-solid rendering.
2. Extend terrain generation with a deterministic waterline fill pass.
3. Update meshing rules so water faces render correctly and internal water faces are culled.
4. Add a minimal renderer/shader path for readable translucent or water-specific rendering.
5. Verify the current player controller behaves acceptably inside water and add only the smallest physics concession if absolutely necessary.
6. Document the first-pass water behavior and its intentional limits.

## Test Plan

- Content/registry tests:
  - `water` is generated into the block registry with the expected metadata
- Terrain tests:
  - chunks below the configured waterline generate water deterministically
  - adjacent chunks agree on shoreline/water placement at their borders
- Mesher/render-data tests:
  - visible water faces are emitted against air
  - shared faces between neighboring water voxels are culled
  - opaque terrain next to water still emits the correct visible faces
- World/block tests:
  - placing a normal block into water replaces the water cell cleanly
  - static water does not spread after nearby block mutations
- Player tests:
  - entering water does not crash or destabilize movement
  - if any lightweight water movement adjustment is added, it is covered by explicit tests
- Manual smoke tests:
  - spawn near low terrain and verify visible lakes/shorelines
  - walk and jump through shallow and deep water
  - place blocks into water and confirm replacement behavior is stable

## Assumptions And Defaults

- Use the next plan filename in sequence: `0036-water-generation-and-simple-player-physics.md`.
- Water is static in v1 and does not flow.
- The server remains authoritative for generated water like any other terrain block.
- Player physics should stay as close to the current controller as possible.
- No swimming, drowning, or current simulation is required for this milestone.
- Water should improve world readability and biome feel without becoming a large simulation system.
