# Column Chunks With No Y-Level Splitting

## Summary

Refactor Craftvale so a chunk is identified only by its horizontal position
`(x, z)` and represents one full vertical column of the world, instead of one
`16x16x16` slice at `(x, y, z)`. Under this model, each chunk stays `16` blocks
wide in `x`, `16` blocks long in `z`, and spans the entire world height from the
bottom to the top of the playable world.

This plan intentionally replaces the current stacked-Y-chunk architecture from
plan 37 with a column-based chunk model. The goal is to simplify chunk identity
and ownership, remove the need to coordinate many chunk layers in one column,
and make systems think in terms of horizontal world regions instead of vertical
chunk stacks.

The target first-pass world still keeps the current `256` block world height and
sea level `64`. What changes is chunk topology, not the terrain scale.

## Key Changes

### Define chunks as horizontal columns only

- A chunk should be identified only by `x` and `z`.
- Remove `chunkY` from chunk identity, chunk keys, storage file names, and
  chunk-delivery messages.
- Each chunk stores a full `16 x 256 x 16` block volume for the current world
  height.
- All code that currently treats one world column as many vertically stacked
  chunk slices should be refactored to treat it as one chunk.

### Keep world height explicit and separate from chunk identity

- Preserve explicit shared world-height constants such as:
  - total world height `256`
  - min/max world Y
  - sea level `64`
- Do not reintroduce Y-layer chunk constants under a different name.
- Strong recommendation:
  - world vertical bounds remain a world concern
  - chunk addressing remains a horizontal streaming concern

### Replace `16x16x16` storage with full-height column storage

- The current chunk storage format and in-memory buffers are sized around one
  `16x16x16` slice.
- Under this plan, one chunk buffer should represent a full column:
  - width `16`
  - depth `16`
  - height `WORLD_HEIGHT_BLOCKS`
- Important consequence:
  - chunk block buffers, light buffers, and mesh dirtiness all become column
    scoped
  - vertical writes no longer cross chunk boundaries

### Simplify chunk lookup and world coordinate conversion

- World/block lookup should still convert world `(x, y, z)` into:
  - chunk `(x, z)`
  - local `(x, y, z)` within the column
- `worldToChunkCoord` and related helpers should be replaced or reshaped so they
  no longer expose a fake `chunk.y`.
- Neighbor logic should only consider:
  - west/east
  - north/south
- Vertical adjacency becomes intra-chunk logic instead of cross-chunk logic.

### Rework generation around column ownership

- Terrain generation should populate one full column chunk at a time.
- Trees, water fills, and future structures should remain deterministic and
  chunk-order safe.
- Strong recommendation:
  - generation for a column may still sample neighboring world positions
  - but writes should only land inside the current `(x, z)` column chunk
- This keeps the same deterministic generation philosophy while removing
  cross-layer chunk coordination.

### Rework lighting for full-height columns

- Lighting should operate on full-height chunk columns rather than stitching
  together many Y slices.
- Important checks:
  - skylight should travel downward through one column buffer naturally
  - block-light propagation should still cross horizontal chunk borders
  - relighting after mutation should only need neighboring columns, not
    neighboring Y chunks
- Strong recommendation:
  - use this refactor to simplify light-region indexing and vertical traversal

### Simplify replication and startup streaming

- Client/server chunk delivery should exchange chunk columns keyed by `(x, z)`.
- Startup pregeneration and active-area loading should request horizontal chunk
  areas only.
- This should remove the need for vertical-radius tuning during startup and
  streaming because each loaded chunk already contains the whole column.
- Important consequence:
  - each chunk payload gets materially larger
  - request counts get smaller

### Update meshing and rendering for column-owned geometry

- Meshing should read one full-height chunk column and emit visible geometry for
  that column.
- Horizontal face culling still checks neighboring chunks.
- Vertical face culling becomes entirely local to the chunk.
- Strong recommendation:
  - keep dirty-region or partial-remesh ideas in mind, because full-column mesh
    rebuilds may become more expensive than slice rebuilds

### Revisit mutation cost and dirty tracking

- One block change inside a column should not require awkward vertical neighbor
  resend logic anymore.
- But it may make per-column remeshing and per-column save dirtiness more
  expensive if handled naively.
- Good first-pass behavior:
  - one mutated column becomes dirty
  - horizontal neighbors become dirty only when border faces are affected
  - no special Y-boundary resend logic remains

### Treat this as a deliberate format and protocol change

- This plan is not backward compatible with the current chunk format.
- Existing persisted chunks and in-flight chunk payload assumptions should be
  treated as obsolete once this lands.
- Strong recommendation:
  - bump storage versions as needed
  - do not preserve old chunk files unless an explicit migration is added later

## Important Files

- `plans/0038-column-chunks-with-no-y-level-splitting.md`
- `README.md`
- `architecture.md`
- `packages/core/src/types.ts`
- `packages/core/src/world/constants.ts`
- `packages/core/src/world/chunk.ts`
- `packages/core/src/world/world.ts`
- `packages/core/src/world/chunk-coords.ts`
- `packages/core/src/world/terrain.ts`
- `packages/core/src/world/mesher.ts`
- `packages/core/src/server/authoritative-world.ts`
- `packages/core/src/server/lighting-system.ts`
- `packages/core/src/server/world-storage.ts`
- `packages/core/src/server/runtime.ts`
- `packages/core/src/shared/messages.ts`
- `apps/client/src/client/world-runtime.ts`
- `apps/client/src/render/renderer.ts`
- `tests/world.test.ts`
- `tests/terrain.test.ts`
- `tests/mesher.test.ts`
- `tests/authoritative-world.test.ts`
- `tests/client-server.test.ts`
- `tests/storage.test.ts`

## Suggested Implementation Order

1. Redefine shared chunk coordinate/types so chunks are addressed by `x` and
   `z` only.
2. Update chunk buffers and helpers to store one full-height column.
3. Refactor world lookup helpers to map world Y into local chunk Y instead of
   chunk-layer selection.
4. Rework terrain generation to populate whole chunk columns deterministically.
5. Rework lighting and relighting around full-height columns.
6. Update save/load, transport payloads, and chunk request flows for `(x, z)`
   chunk identity.
7. Rework meshing, dirty tracking, and affected-neighbor logic around horizontal
   chunk borders only.
8. Rebaseline tests and docs for the new chunk model.

## Test Plan

- World/chunk tests:
  - world coordinate conversion resolves to `(chunkX, chunkZ)` plus local Y
  - vertical block reads and writes stay within one chunk column
  - horizontal boundary reads and writes still work across neighboring chunks
- Terrain tests:
  - generated columns fill the full vertical range correctly
  - sea level remains `64`
  - trees and water remain deterministic and chunk-order safe
- Lighting tests:
  - skylight propagates top-to-bottom within one chunk column
  - horizontal neighbor block-light propagation still works
  - mutation relighting only touches nearby horizontal neighbors
- Persistence/network tests:
  - chunk columns save/load correctly with the new binary layout
  - client/server chunk delivery uses `(x, z)` chunk identity only
  - startup loading completes with the new column chunk payloads
- Manual smoke tests:
  - load into a world and confirm terrain above and below the player renders
  - break and place blocks at multiple heights inside one chunk column
  - verify lighting updates still look correct near column borders

## Assumptions And Defaults

- Use the next plan filename in sequence:
  `0038-column-chunks-with-no-y-level-splitting.md`.
- The world height remains `256` in the first pass.
- Sea level remains `64` in the first pass.
- Chunks are identified only by `x` and `z`.
- This plan intentionally replaces stacked Y chunks instead of supporting both
  chunk models at once.
