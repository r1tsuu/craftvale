# Generated Content Registry And Scalable Block/Item Ids

## Summary

Refactor block and item definition ownership so Craftvale no longer relies on hand-maintained numeric ids, duplicated registry entries, and manually updated TypeScript unions in `types.ts`. The current setup works for a small fixed content set, but it scales poorly: adding a new block-backed item requires editing several files in lockstep, choosing unused ids manually, and keeping block/item relationships synchronized by convention. This plan introduces a single canonical content-spec source and a generation step that emits stable runtime registries, derived TypeScript id types, and shared lookup helpers. The goal is not to replace numeric ids in saves or network payloads; it is to make those ids generated, validated, and deterministic instead of authored in a brittle way.

## Key Changes

### Introduce one canonical content definition source

- Add a single source-of-truth content description for blocks and items, for example under `packages/core/src/world/content-spec.ts` or a generated-input file under `apps/cli`.
- That source should describe:
  - stable string keys such as `grass`, `stone`, `glowstone`
  - whether an entry is a block, item, or paired block-item
  - human-facing metadata such as display names, colors, tiles, render pass, stack size, emitted light, and placement/drop relationships
- Strong recommendation:
  - avoid making `blocks.ts`, `items.ts`, and `types.ts` all separate authoring surfaces
  - author content once, derive the rest

### Generate numeric ids instead of hand-writing them

- Replace manual numeric id assignment in `packages/core/src/types.ts`, `packages/core/src/world/blocks.ts`, and `packages/core/src/world/items.ts` with generated output.
- Preserve numeric ids as the runtime and persistence identity because:
  - chunks store block ids compactly
  - player inventory and dropped-item payloads already use item ids
  - network and save formats benefit from compact numeric data
- Strong recommendation:
  - keep generated numeric ids deterministic and stable once assigned
  - prefer an explicit ordered manifest or generated lockfile over “assign the next free number at runtime”
  - reserve id ranges intentionally, for example one range for blocks and one for items, if that still helps readability

### Replace manual union types with generated id types

- Today `BlockId` and `ItemId` are hand-edited numeric unions.
- Generate those types from the canonical registry source so they stay correct automatically as content grows.
- Good first-pass options:
  - generated TypeScript union aliases
  - generated `const` maps plus derived literal unions
  - branded numeric ids if that improves boundary safety without making call sites noisy
- Important discipline:
  - generated typing should still keep `BlockId` and `ItemId` distinct at compile time
  - do not collapse them into one generic numeric content id

### Generate block and item registries from shared definitions

- `packages/core/src/world/blocks.ts` and `packages/core/src/world/items.ts` should become thin generated outputs or thin wrappers over generated data.
- Common duplicated fields such as names, colors, and block-item relationships should be authored once and emitted into both registries where needed.
- Good examples of generated relationships:
  - block `dropItemId`
  - item `placesBlockId`
  - item `renderBlockId`
  - block atlas tile bindings
- This keeps current gameplay semantics while removing double entry.

### Add stable string keys for human-friendly authoring

- Numeric ids are good runtime identities but bad authoring identities.
- Introduce stable symbolic keys like:
  - `grass`
  - `dirt`
  - `bedrock`
  - `glowstone`
- Generated outputs should provide key-based lookup helpers in addition to numeric lookup helpers where useful.
- Strong recommendation:
  - use string keys only for authoring, tooling, tests, and debug paths
  - keep hot loops, chunk storage, and replication on numeric ids

### Add generation-time validation

- The generation step should fail fast on content mistakes that are currently easy to miss, such as:
  - duplicate keys
  - duplicate numeric ids in locked/generated output
  - item references to unknown block keys
  - block drop references to unknown item keys
  - invalid atlas tile names
  - missing required metadata for a given content kind
- This should move error discovery from runtime to build/test time.

### Keep id stability explicit for saves and protocol compatibility

- Existing saves and protocol payloads assume numeric ids are stable.
- This refactor should preserve current ids for all existing shipped content unless the team explicitly chooses a breaking save reset.
- Strong recommendation:
  - introduce a generated registry snapshot or checked-in lockfile that records assigned numeric ids by key
  - make new content additions append new ids instead of re-sorting all ids automatically
  - treat id churn as a deliberate migration event, not a side effect of editing content order

### Put generation under repo tooling ownership

- The generation step belongs under `apps/cli`, not as an ad hoc root script.
- Good first-pass tooling shape:
  - an `apps/cli/src/generate-content-registry.ts` command
  - an npm/bun script wired through workspace package scripts
  - generated files written into `packages/core/src/world/generated/*` or a similarly explicit folder
- Strong recommendation:
  - check generated outputs into git if that keeps app startup simple and makes diffs easy to review
  - keep the generator deterministic so CI and local runs produce byte-for-byte identical output

### Keep world logic consuming generated helpers, not raw manifest shape

- Game/runtime code should continue to call stable helpers such as:
  - `getBlockDefinition`
  - `getItemDefinition`
  - `getDroppedItemIdForBlock`
  - `getPlacedBlockIdForItem`
- The new authoring/generation layer should sit behind those helpers so gameplay systems do not need to know whether data was hand-authored or generated.
- This keeps the refactor incremental and reduces code churn outside the registry boundary.

### Leave room for future non-block content families

- The registry model should not assume every future item is placeable or every content entry is voxel terrain.
- This plan should make future additions easier, including:
  - tools
  - consumables
  - equipment
  - crafting ingredients
  - utility blocks that share some but not all metadata with terrain blocks
- The content schema should support optional capability sections rather than one giant flat object with many meaningless fields.

## Important Files

- `plans/0030-generated-content-registry-and-scalable-block-item-ids.md`
- `README.md`
- `architecture.md`
- `packages/core/src/types.ts`
- `packages/core/src/world/blocks.ts`
- `packages/core/src/world/items.ts`
- `packages/core/src/world/atlas.ts`
- `packages/core/src/world/terrain.ts`
- `packages/core/src/world/inventory.ts`
- `packages/core/src/server/authoritative-world.ts`
- `packages/core/src/server/world-storage.ts`
- `packages/core/src/shared/messages.ts`
- `apps/cli/src/*` for generation tooling ownership
- `tests/inventory.test.ts`
- `tests/storage.test.ts`
- `tests/client-server.test.ts`
- `tests/atlas.test.ts`

## Suggested Implementation Order

1. Define the canonical content-spec format and choose where the authored registry source lives.
2. Build a deterministic generator under `apps/cli` that emits block/item registry outputs plus generated id typings.
3. Preserve current ids by seeding the generator with the existing block/item mapping.
4. Refactor `blocks.ts`, `items.ts`, and related helpers to consume generated outputs instead of hand-authored records.
5. Update tests so they assert id stability and generated relationship correctness.
6. Add docs describing how to add a new block or item through the new content-spec path.
7. Optionally follow with a second pass that applies the same pattern to future content families beyond blocks/items.

## Test Plan

- Generator tests:
  - duplicate keys fail generation
  - invalid cross-references fail generation
  - generated output is deterministic for the same authored content
  - existing block/item ids remain unchanged after regeneration
- Registry tests:
  - block lookup helpers return the same semantics as before for existing content
  - item placement and block drop mappings still resolve correctly
  - hotbar defaults still point at the intended starter item ids
- Integration tests:
  - saves containing current block and item ids still round-trip correctly
  - client/server inventory and dropped-item replication still use the expected numeric ids
  - terrain generation and meshing still resolve correct block definitions and atlas tiles
- Manual smoke tests:
  - add one new block-backed item through the authored content spec only
  - regenerate outputs
  - confirm the new content appears without hand-editing `types.ts`, `blocks.ts`, and `items.ts` separately

## Assumptions And Defaults

- Use the next plan filename in sequence: `0030-generated-content-registry-and-scalable-block-item-ids.md`.
- Numeric ids remain the runtime identity for chunk storage, saves, and network payloads.
- Stable string keys become the authoring identity.
- Current ids for existing content should stay fixed by default to avoid accidental save/protocol breakage.
- The generator should be deterministic, repo-owned, and safe to run in CI.
- The goal is a scalable authoring model, not a gameplay redesign.
