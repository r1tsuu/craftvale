# Block Entities And Crafting Table

## Status

Implemented.

## Summary

Introduce a dedicated server-owned block-entity architecture for blocks that need
stateful behavior and tick hooks, then use it to add the first entity-backed block:
the crafting table.

This plan is intentionally scoped to the entity foundation and one temporary
interaction path. It does not implement crafting recipes or crafting UI yet.

The current shipped behavior is:

- `craftingTable` exists as a placeable block/item in generated content
- placing a crafting table creates a matching block entity on the server
- breaking/replacing that block removes the block entity
- the authoritative server ticks block entities every world tick through a shared
  `BlockEntitySystem`
- right-clicking a crafting table sends a server-owned `useBlock` intent
- the server currently responds with the temporary chat message:
  - `CRAFTING TGABLE WAS CLICKED (TEMPORARY)`

## Goals That Landed

- Add a reusable architecture for entity-backed blocks instead of special-casing
  crafting tables directly inside `AuthoritativeWorld`.
- Keep chunk voxels and block entities separate:
  - chunk data still answers what block is present at `(x, y, z)`
  - block entities own server-side behavior for blocks that need use/tick logic
- Make the first block entity persistent across save/load.
- Route crafting-table use through the authoritative server tick pipeline.
- Leave clean extension points for furnaces, chests, doors, and similar future blocks.

## Final Architecture

### Content layer

- `packages/core/src/world/content-spec.ts` now defines:
  - `craftingTable` block
  - `craftingTable` item
- Generated content ids/registries include both entries so the block can be placed,
  held, and given via commands.

### World entity layer

- `WorldEntityState` now owns generic block-entity components:
  - block-entity type
  - block-entity position
- Block entities share the same world-level entity registry as players and dropped
  items, instead of introducing a separate id space.

### Block-entity system

- `BlockEntitySystem` owns:
  - loading persisted block entities
  - saving block entities
  - indexing block entities by block position
  - dispatching `onUse`
  - dispatching `onTick`
  - syncing entity presence when a block is placed, replaced, or broken
- Behaviors are registered per block-entity type, not hard-coded per call site.

Recommended future pattern:

- add a new block/item in content
- add a new block-entity behavior entry
- add any extra component stores needed for that block’s state
- keep `AuthoritativeWorld` responsible for chunk mutation and the block-entity
  system responsible for entity-backed behavior

### Server interaction flow

The use path is now:

1. Client right-clicks a focused crafting table.
2. Client sends `useBlock { x, y, z }`.
3. `WorldSessionController` queues a `useBlock` gameplay intent.
4. `AuthoritativeWorld.runTick()` drains that intent on the next server tick.
5. `BlockEntitySystem.useBlock()` resolves the entity at that coordinate and runs
   the behavior.
6. The tick result carries the server-authored system chat message back to the
   correct player.

This keeps the temporary crafting-table interaction fully server-owned.

### Persistence

- World storage now has a dedicated block-entities file separate from:
  - chunk files
  - player files
  - dropped-item files
  - world-time file
- This is important because future furnaces/chests/doors will need extra state
  beyond the presence of a block in a chunk.

## Non-Goals

- Crafting recipes
- Crafting result slot logic
- Player `2x2` crafting
- Crafting-table `3x3` recipe evaluation
- Container UI replication
- Chest/furnace/door gameplay behavior beyond the shared architecture
- Rich crafting-table visuals or unique textures

## Important Files

- `plans/0050-block-entities-and-crafting-table.md`
- `plans/0051-crafting-system.md`
- `packages/core/src/server/block-entity-system.ts`
- `packages/core/src/server/world-entity-state.ts`
- `packages/core/src/server/authoritative-world.ts`
- `packages/core/src/server/world-session-controller.ts`
- `packages/core/src/server/world-tick.ts`
- `packages/core/src/server/runtime.ts`
- `packages/core/src/server/world-storage.ts`
- `packages/core/src/shared/messages.ts`
- `packages/core/src/world/content-spec.ts`
- `packages/core/src/world/generated/content-ids.ts`
- `packages/core/src/world/generated/content-registry.ts`
- `apps/client/src/app/play-controller.ts`
- `tests/authoritative-world.test.ts`
- `tests/client-server.test.ts`
- `tests/play-controller.test.ts`

## Validation

- `bun run generate:content`
- `bun run typecheck`
- `bun test`
- Manual:
  - place a crafting table
  - right-click it
  - confirm chat shows `CRAFTING TGABLE WAS CLICKED (TEMPORARY)`
  - save and reload the world
  - confirm the crafting table still responds
