# Source Tile PNG Pipeline And Generated Atlas

## Summary

Refactor the texture asset pipeline so Craftvale no longer treats the final atlas PNG as both the authoring format and the runtime format. Today all voxel texture art effectively lives inside the atlas output, which makes single-tile edits awkward, makes mixed hand-authored and generated textures harder to support, and couples authoring concerns to runtime packing concerns. This plan introduces a two-stage texture pipeline: one PNG per logical tile as the source format, followed by a deterministic atlas-generation step that packs those tiles into the runtime atlas and emits the same atlas metadata/UVs the renderer already consumes.

The goal is to make tile authoring scalable, support both hand-authored and generated textures, and keep runtime rendering simple by still consuming one packed atlas at runtime.

## Key Changes

### Separate source textures from runtime atlas output

- Introduce a source-texture directory containing one PNG per logical tile id, for example:
  - `apps/client/assets/textures/tiles-src/dirt.png`
  - `apps/client/assets/textures/tiles-src/grass-top.png`
  - `apps/client/assets/textures/tiles-src/grass-side.png`
- Keep the runtime atlas output as a generated artifact, for example:
  - `apps/client/assets/textures/voxel-atlas.png`
- Strong recommendation:
  - treat per-tile PNGs as the editable source assets
  - treat the packed atlas as a build output

### Add an optional generated-tile input stage

- Support a second input source for tile PNG generation, for example:
  - `apps/client/assets/textures/generated-src/*`
  - or a generator-owned temp/output folder under `apps/cli`
- This should allow future procedural or code-generated tiles to participate in the same atlas build without special-casing the renderer.
- Good first-pass behavior:
  - gather hand-authored tile PNGs
  - generate any procedural tiles
  - combine both sets into one validated tile manifest
  - pack that manifest into the runtime atlas

### Keep logical tile ids as the content-facing identity

- Block content and atlas lookup should continue to refer to logical tile ids such as:
  - `dirt`
  - `grass-top`
  - `grass-side`
  - `glowstone`
- The content system should not depend on file paths or atlas coordinates directly.
- Important discipline:
  - `content-spec.ts` keeps naming tile ids
  - the atlas pipeline resolves tile ids to PNGs and UVs
  - runtime code keeps using tile ids and generated atlas metadata only

### Move atlas construction fully under repo tooling ownership

- Extend `apps/cli` so atlas generation becomes an explicit deterministic build step sourced from per-tile PNGs.
- Good first-pass tooling shape:
  - keep `apps/cli/src/generate-voxel-atlas.ts` as the entry point
  - teach it to read tile PNGs from disk instead of treating the atlas as the source art
  - have it emit the packed atlas plus any required metadata/code outputs
- Strong recommendation:
  - keep atlas generation reproducible and byte-for-byte deterministic
  - continue checking the final atlas output into git if that keeps runtime startup simple

### Support both hand-authored and generated tiles in one manifest

- The atlas builder should assemble a single in-memory tile manifest keyed by tile id before packing.
- Each tile id should resolve to exactly one RGBA image payload.
- Good validation cases:
  - duplicate tile ids across hand-authored and generated sources fail
  - missing tile ids referenced by content fail
  - mismatched dimensions fail
  - unsupported color formats fail

### Preserve the current runtime atlas rendering model

- The renderer should still load one atlas texture at runtime.
- Meshing, shader usage, and UV lookup should continue to work from atlas metadata exactly as they do now.
- This plan is an authoring/build-pipeline refactor, not a runtime rendering redesign.

### Make room for future texture families and content growth

- The source-tile model should scale beyond the current terrain set.
- Future content should be able to add tiles without manually editing a giant atlas image.
- This should help with:
  - new placeable blocks
  - utility blocks
  - alternate biome materials
  - generated decorative textures
  - eventual content packs or mod-like data extensions

### Clarify the authored vs generated asset boundary

- After this refactor there should be a clear split:
  - authored content metadata in `packages/core/src/world/content-spec.ts`
  - authored source tile PNGs under a source-texture directory
  - generated atlas outputs under the current runtime asset path
- Strong recommendation:
  - document this boundary in `README.md` so contributors know which files they are expected to edit directly

## Important Files

- `plans/0031-source-tile-png-pipeline-and-generated-atlas.md`
- `README.md`
- `architecture.md`
- `apps/cli/src/generate-voxel-atlas.ts`
- `apps/cli/src/*` for any new tile-collection or PNG-generation helpers
- `apps/client/assets/textures/*`
- `packages/core/src/world/atlas.ts`
- `packages/core/src/world/content-spec.ts`
- `packages/core/src/world/generated/*` if atlas-related generated metadata remains code-generated
- `tests/atlas.test.ts`
- `tests/mesher.test.ts`

## Suggested Implementation Order

1. Choose the source-texture directory layout and decide where generated source tiles should live.
2. Refactor atlas generation so it reads one PNG per tile id from disk instead of treating the atlas as the editable source.
3. Add a manifest-building phase that merges hand-authored and generated tile sources while validating duplicates and missing ids.
4. Keep atlas packing deterministic and continue emitting the runtime atlas plus existing UV metadata.
5. Update docs to describe the new texture workflow and how it relates to `content-spec.ts`.
6. Add one smoke-test texture addition through the new pipeline to confirm the workflow is simpler than editing the atlas directly.

## Test Plan

- Atlas pipeline tests:
  - source tiles load from per-tile PNG files
  - duplicate tile ids fail generation
  - missing tile ids referenced by content fail generation
  - mixed authored/generated tile inputs merge deterministically
  - atlas output is deterministic for the same tile manifest
- Rendering/mesher tests:
  - existing block tile ids still resolve to the expected UVs
  - cutout tiles such as leaves still preserve transparency correctly
  - existing mesher tests continue to pass without changing runtime semantics
- Manual smoke tests:
  - edit one existing tile PNG and regenerate the atlas
  - add one new tile PNG and wire it into content
  - add one generated tile source and confirm it also appears in the atlas

## Assumptions And Defaults

- Use the next plan filename in sequence: `0031-source-tile-png-pipeline-and-generated-atlas.md`.
- Runtime rendering should keep using one packed atlas texture.
- Tile ids remain logical names rather than file paths.
- Atlas generation should remain deterministic and repo-owned under `apps/cli`.
- Hand-authored and generated textures should be able to coexist in the same atlas build.
- This plan improves authoring/build workflow, not rendering behavior.
