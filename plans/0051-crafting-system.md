# Crafting System

## Summary

Add the actual crafting feature on top of the block-entity groundwork from
`0050-block-entities-and-crafting-table.md`.

The first real crafting pass should cover:

- player inventory crafting grid: `2x2 -> 1 result`
- recipe: `1 log -> 4 planks`
- recipe: `4 planks -> 1 crafting table`
- crafting-table interaction backed by the entity system from plan `0050`
- crafting-table UI layout: `3x3 -> 1 result`
- no additional `3x3` recipes in the first pass beyond opening the correct UI

## Goals

- Keep crafting server-authoritative.
- Reuse shared inventory slot logic instead of inventing separate drag rules for
  crafting inputs.
- Treat the crafting table as a block entity / container endpoint, not just a block id.
- Support future block-entity containers such as:
  - furnaces
  - chests
  - doors with server-owned state or ticking behavior

## Proposed Design

### 1. Split player crafting and table crafting into distinct containers

Keep two crafting surfaces:

- player crafting:
  - input grid `2x2`
  - output `1`
  - available from the inventory screen
- crafting table crafting:
  - input grid `3x3`
  - output `1`
  - available only when interacting with a crafting-table block entity

Both should use the same shared recipe-matching code.

### 2. Add a recipe registry in shared/world code

Introduce a recipe definition layer in `packages/core/src/world/` that can express:

- shaped recipes
- input width/height
- normalized empty cells
- output item id and count

The first recipes should be:

- `log x1 -> planks x4`
- `planks x4 in a 2x2 square -> craftingTable x1`

Recommendation:

- keep recipe evaluation pure and testable
- avoid baking recipe knowledge into UI code or into `AuthoritativeWorld`

### 3. Model crafting as server-owned container state

Crafting should not be implemented as a purely client-local overlay.

Recommended ownership:

- player `2x2` crafting state belongs to the player session/inventory model
- crafting-table `3x3` crafting state belongs to the targeted block entity

That means:

- input slot mutation stays authoritative
- result-slot claiming is validated by the server
- consuming ingredients happens on the server when the result is taken

### 4. Add explicit open-container / active-container flow

The temporary `useBlock` message from plan `0050` should evolve into:

- server resolves the targeted crafting-table block entity
- server opens an active container session for that player
- client renders the matching crafting-table UI from authoritative data

Recommended first-pass container metadata:

- container kind
- target block-entity id if applicable
- slot layout definition
- authoritative slot contents

### 5. Keep crafting results derived, not stored blindly

Avoid storing a stale “result slot item” as independent truth.

Preferred model:

- result slot is derived from current input slots and recipe evaluation
- when the player takes the result:
  - validate the recipe still matches
  - grant the output
  - consume inputs
  - recompute the next result

This avoids drift between inputs and output.

## Important Files

- `plans/0050-block-entities-and-crafting-table.md`
- `plans/0051-crafting-system.md`
- `packages/core/src/world/inventory.ts`
- `packages/core/src/world/content-spec.ts`
- `packages/core/src/world/generated/content-ids.ts`
- `packages/core/src/world/generated/content-registry.ts`
- `packages/core/src/world/` new recipe/container helpers
- `packages/core/src/server/block-entity-system.ts`
- `packages/core/src/server/authoritative-world.ts`
- `packages/core/src/server/player-system.ts`
- `packages/core/src/server/world-session-controller.ts`
- `packages/core/src/server/world-tick.ts`
- `packages/core/src/shared/messages.ts`
- `apps/client/src/app/play-controller.ts`
- `apps/client/src/ui/hud.ts`
- `tests/inventory.test.ts`
- `tests/authoritative-world.test.ts`
- `tests/client-server.test.ts`

## Test Plan

- Recipe tests:
  - `1 log -> 4 planks`
  - `4 planks -> 1 crafting table`
  - partial or rotated invalid layouts fail correctly if recipes are shaped
- Player crafting tests:
  - `2x2` grid derives the expected result
  - taking the result consumes the correct ingredients
- Crafting-table tests:
  - interacting with a crafting table opens the `3x3` container
  - closing and reopening preserves authoritative input slots
  - table state persists across save/load
- Integration tests:
  - client and server stay synchronized when moving items in and out of crafting grids
  - result taking cannot duplicate items across rapid clicks or network delay

## Non-Goals For The First Crafting Pass

- Shift-click crafting shortcuts
- Recipe book UI
- Bulk craft acceleration
- Furnace/smelting recipes
- Chest transfer shortcuts
- Advanced door logic
