# World-Level Entity Ownership Or Player Subsystem

## Summary

Before extending the current player-focused entity work to dropped items or other world actors, decide whether this project is building toward a shared world-level entity architecture or a narrower player subsystem. The current refactor improved player ownership and internal identity, but it still looks more like a dedicated player system than a reusable ECS foundation. The next step should make that boundary explicit so we do not accidentally grow multiple parallel registries and call the result one ECS.

## Key Changes

### Make the architectural boundary explicit

- The current player refactor should not be treated as a fully general ECS by default.
- We should choose one of two intentional directions:
  - move entity registry and component-store ownership up to the world level
  - or explicitly treat the current work as a player subsystem rather than the engine’s ECS foundation
- The important change is clarity:
  - future actor work should follow an intentional model instead of extending whatever happens to exist today

### Option A: Move registry and stores to the world level

- If we want dropped items, mobs, projectiles, and future actors to share one entity model, the registry should live at the world/session level rather than inside `PlayerSystem`.
- Recommended shape:
  - `AuthoritativeWorld` owns the shared `EntityRegistry`
  - component stores with cross-actor reuse also live at the world level
  - actor-specific systems such as `PlayerSystem` and future `DroppedItemSystem` operate over that shared registry and store set
- This creates a truer ECS-like foundation:
  - one entity id space per world
  - one place for shared spatial indexing
  - fewer parallel actor registries

### Option B: Explicitly keep a player subsystem

- If we do not want to commit to a shared ECS yet, we should document that the current design is a player subsystem and not a generalized world-entity framework.
- In that model:
  - `PlayerSystem` remains player-specific
  - future dropped items can use a separate parallel registry or manager
  - shared ECS terminology should stay limited so expectations match reality
- This is a valid choice if we want to stay incremental and avoid lifting abstractions too early.

### Avoid an accidental middle ground

- The most awkward outcome would be adding dropped items as another parallel registry while still talking about the code as one unified ECS.
- That path tends to create:
  - duplicated component types
  - duplicated persistence patterns
  - harder cross-actor queries
  - confusing architecture language in code and plans
- Strong recommendation:
  - do not add the next actor type until this ownership decision is written down

### Clarify what belongs at the world level even without chunk entities

- Chunks still should not become entities.
- Even if we choose a world-level entity registry, chunk data should remain coordinate-addressed world resources.
- Good world-level ownership candidates are:
  - entity registry
  - shared component stores for actors
  - spatial indexes for actor lookup by chunk/cell
  - replication queries over nearby actors
- Good non-entity world resources remain:
  - chunks
  - world generation
  - save orchestration for terrain data

### Keep player inventory boundaries explicit

- Inventory should still remain player-owned data unless we intentionally add containers or shared inventories.
- Moving registry ownership to the world level does not require making inventory its own entity.
- If we keep the player-subsystem model, inventory should continue living there.
- If we move to a shared world-level entity model, inventory can still remain a player component.

### Align naming with the actual architecture

- If we choose the world-level route:
  - keep using ECS/entity-system language
  - document `PlayerSystem` as one system operating within a shared entity world
- If we choose the narrower route:
  - prefer terms like `PlayerSystem`, `player actor state`, or `player subsystem`
  - avoid implying that all future actor work already has a shared ECS home
- Accurate naming matters because it drives future design choices and expectations.

### Let dropped items depend on this decision

- The dropped-item implementation plan should follow this plan, not skip it.
- If we choose world-level entity ownership:
  - dropped items should reuse the shared entity id space and shared stores where appropriate
- If we choose the player-subsystem direction:
  - dropped items can use a separate parallel registry or manager without pretending it is the same ECS
- This keeps the next gameplay feature from forcing an accidental architecture decision under deadline pressure.

## Important Files

- `plans/0018-player-entity-system-refactor.md`
- `plans/0019-world-level-entity-ownership-or-player-subsystem.md`
- `plans/0020-dropped-item-entities-and-pickups.md`
- `architecture.md`
- `src/server/authoritative-world.ts`
- `src/server/player-system.ts`
- `src/server/entity-system.ts`
- `src/server/runtime.ts`
- `src/shared/messages.ts`
- `src/client/world-runtime.ts`

## Test Plan

- Architecture validation tests if we choose world-level ownership:
  - player and non-player actor systems can allocate entities from one shared registry
  - shared spatial lookup can reference mixed actor types without duplicate id spaces
  - persistence and replication boundaries stay clear per actor type
- Architecture validation tests if we keep the player-subsystem model:
  - player logic remains isolated from non-player managers
  - runtime naming and interfaces do not imply a shared ECS that does not exist
  - future actor managers can coexist without conflicting with player ids or persistence
- Manual design validation:
  - confirm the chosen direction is reflected consistently in plans, architecture docs, and module names before implementing dropped items

## Assumptions And Defaults

- Use the next plan filename in sequence: `0019-world-level-entity-ownership-or-player-subsystem.md`.
- Strong recommendation:
  - make this decision before implementing dropped items
- Chunks remain world resources, not entities, in either direction.
- Player inventory remains player-owned state in either direction unless a later plan intentionally broadens that model.
