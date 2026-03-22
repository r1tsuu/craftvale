# Biome System

## Summary
Add a biome system to world generation so terrain is no longer one uniform grassy landscape with the same tree pattern everywhere. The first pass should focus on deterministic biome classification, biome-aware terrain surface composition, and biome-specific decoration rules while preserving the project’s current chunk-order safety and small-codebase simplicity. Biomes should be derived entirely from the world seed and world-space coordinates so the same world always regenerates identically on both the server and client.

## Key Changes

### Biome classification layer
- Introduce an explicit biome sampling step separate from raw height generation.
- Start with a small biome set such as:
  - plains
  - forest
  - rocky highlands
  - sparse/dry biome such as scrubland or desert
- Derive biome choice from one or more low-frequency noise fields instead of hardcoded chunk regions.
- Keep biome transitions deterministic and world-space based so chunk generation remains order-independent.
- Avoid noisy one-column checkerboarding by smoothing the sampled biome signals before final classification.

### New biome data model
- Add a biome definition type that describes generation behavior instead of scattering biome conditionals throughout terrain code.
- Recommended biome metadata includes:
  - biome id/name
  - surface block
  - near-surface filler block
  - deep block
  - height modifiers or roughness weights
  - tree/decorator density
  - allowed structure/decorator families
- Keep this definition data-oriented so adding later biomes is mostly configuration plus any needed assets/blocks.

### Terrain shaping by biome
- Refactor `getTerrainHeight(...)` so it can incorporate biome-aware parameters rather than returning one universal height profile.
- Use biome signals to influence:
  - average elevation
  - local roughness
  - slope intensity
- Preserve the current one-layer vertical world constraint for this pass, so biome shaping must still clamp safely within the supported `CHUNK_SIZE` range.
- At biome boundaries, blend height parameters to avoid obvious seams or step changes.

### Surface and subsurface block variation
- Stop assuming every column ends in grass/dirt/stone.
- Let each biome choose different top and filler materials where appropriate.
- Minimum implementation options:
  - reuse existing blocks first if we want a low-content pass
  - or introduce a small number of new blocks such as sand or coarse stone if the visual payoff justifies the extra atlas work
- Keep deep underground stone-like material simple unless a biome strongly needs a different base.

### Biome-aware decoration and structures
- Refactor the current tree decoration pass into a more general decoration layer.
- Biomes should control:
  - whether trees are allowed
  - tree density
  - tree style/family
  - optional sparse decorations such as boulders, shrubs, or dead trees later
- Preserve the current chunk-safe structure sampling approach:
  - sample candidate anchors in and around the target chunk
  - emit only in-bounds voxels for the chunk being built
- Forest biomes should feel denser than plains; dry/rocky biomes should have few or no standard trees.

### Biome query helpers
- Add worldgen helpers that can answer questions like:
  - `getBiomeAt(seed, worldX, worldZ)`
  - `getBiomeParameters(seed, worldX, worldZ)`
  - `getSurfaceBlockForBiome(biome)`
- Keep these helpers pure and deterministic so they are easy to test and safe to reuse in future systems like minimaps, fog tuning, ambient audio, or mob spawning.

### Content and atlas implications
- If new biome blocks are added, extend the voxel atlas and block definitions to support them.
- Keep the first pass conservative:
  - do not introduce a large block explosion just because biomes exist
  - prefer a few visually meaningful additions over many nearly identical materials
- Any new foliage/decorative blocks should continue to respect the existing opaque vs cutout render-pass rules.

### Save/load and networking impact
- Biomes should remain procedural and derived from the world seed; they do not need separate persistence.
- The server remains authoritative for generated chunks, but biome logic must be deterministic enough that regenerated baseline chunks still match saved-world comparisons.
- Avoid embedding transient biome caches into saved chunk data in this pass.

## Important Public Interfaces/Types
- Add biome types such as:
  - `BiomeId`
  - `BiomeDefinition`
  - `BiomeSample`
- Terrain generation gains biome sampling and biome-parameter helpers.
- Decoration helpers become biome-aware instead of assuming one global tree policy.
- Block/atlas interfaces may expand if new biome materials are introduced.

## Test Plan
- Biome sampling tests:
  - the same seed and coordinates always return the same biome
  - different seeds produce different biome layouts
  - nearby columns do not flicker excessively between unrelated biomes
- Terrain tests:
  - biome-aware height output stays within valid vertical limits
  - biome transitions do not create obvious one-block cliffs solely from classification changes
  - surface blocks match biome rules
- Decoration tests:
  - forests generate more tree coverage than plains for representative samples
  - dry/rocky biomes suppress standard tree placement if intended
  - decoration remains consistent across chunk borders regardless of generation order
- Asset/block tests:
  - any new atlas tiles and block mappings match code constants
  - new cutout decorative blocks, if any, follow the correct render path
- Manual validation:
  - traversing the world reveals visibly distinct regions
  - biome borders feel organic rather than chunk-aligned
  - different biomes change both terrain shape and decoration density, not just block color

## Assumptions And Defaults
- This pass is about biome-driven world generation, not weather, temperature simulation, or dynamic seasons.
- Biomes remain fully procedural from the world seed; no separate biome save format is required.
- The current single vertical chunk layer stays in place, so biome variation must fit inside that height budget.
- Use a small initial biome catalog and expand later only if the code remains data-driven and manageable.
- Use the next plan filename in sequence: `0006-biome-system.md`.
