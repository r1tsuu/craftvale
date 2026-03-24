# Dropped Item Entities And Pickup Flow

## Summary
Add server-authoritative dropped item entities so broken collectible blocks spawn item stacks into the world instead of going straight into a player inventory. Players should pick those items up by moving near them, with the server deciding when pickup succeeds, how much inventory space is available, and when the dropped item entity should remain, shrink, or despawn. This plan should build on the player/entity refactor, but it can still be staged so the dropped-item flow lands after the player ECS foundation is in place.

## Key Changes

### Represent dropped items as entities
- Add a dedicated dropped-item actor type to the new entity layer.
- Recommended first-pass components:
  - `TransformComponent` for world position
  - `VelocityComponent` for drop toss and gravity
  - `ItemStackComponent` for block/item id and count
  - `PickupCooldownComponent` so items are not re-collected instantly on spawn
  - `LifetimeComponent` if we want timed cleanup
- Keep the item stack as component data on the dropped item entity rather than creating a second nested entity per stack.

### Change block break flow to spawn drops instead of direct inventory credit
- Update authoritative block mutation rules so collectible block breaks:
  - remove the block from the world
  - spawn one or more dropped item entities at or near the broken block position
  - do not immediately add the block to the player inventory
- Preserve server validation:
  - breaking air still does nothing
  - non-collectible blocks still yield nothing
  - failed breaks do not spawn drops
- Keep creative-mode exceptions explicit if desired:
  - creative may still skip drop spawning if that feels better for testing
  - or creative can spawn drops too, but that should be an intentional rule

### Add a server-side pickup system
- Introduce a pickup system that checks active players against nearby dropped item entities.
- Pickup should remain authoritative:
  - client proximity alone does not grant items
  - the server evaluates pickup radius, cooldown, and inventory space
- On successful pickup:
  - add as much of the stack as possible to the player inventory
  - remove the dropped item entity if fully collected
  - otherwise leave a reduced remainder in the world
- This gives us clean behavior for partial pickup when the inventory is nearly full.

### Reuse inventory helpers for transfer rules
- Keep stacking and slot-fill logic centralized in `src/world/inventory.ts` or nearby shared helpers.
- Dropped item pickup should call the same authoritative add-item logic the inventory plan already introduced.
- This avoids inventing a second path for stack merge rules and makes overflow behavior consistent.

### Keep spatial ownership chunk-based, but do not make chunks entities
- Strong recommendation:
  - index dropped items by chunk or nearby-cell buckets for lookup efficiency
  - do not convert terrain chunks themselves into entities
- Useful pattern:
  - dropped item entities live in the entity registry
  - a spatial index maps chunk coordinates to nearby dropped item ids
  - chunk load/unload and replication can query that index
- This keeps chunk systems fast and lets dropped items ride on the same world-coordinate model as blocks and players.

### Replicate dropped items to the client
- Extend the protocol so the client can learn about nearby dropped items explicitly.
- Likely additions:
  - initial dropped item snapshot on join or chunk request for nearby space
  - server events for dropped item spawn/update/remove
  - typed payloads carrying entity id, transform, and item stack data
- The client runtime should store replicated dropped items separately from chunks and players, even if they later share generic entity DTO helpers.

### Add simple dropped-item rendering
- Render dropped items in a lightweight, readable way before chasing polished visuals.
- Reasonable first-pass options:
  - small block-like cube using the existing atlas
  - flat billboard/icon quad if easier
  - stack-count text only if visuals need to stay minimal for now
- Keep the rendering path decoupled from chunk meshing so item entities can animate or move without rebuilding terrain meshes.

### Handle pickup feedback and edge cases
- When the player picks up an item, the server should replicate the updated inventory and remove or shrink the dropped entity.
- When inventory is full:
  - leave the dropped item in the world
  - optionally show a user-visible status message
- Consider a short spawn immunity or owner-preference rule if the spawning player should have first chance to collect the item.

### Persist dropped items with the world when practical
- Strong recommendation:
  - persist active dropped items on save/load
- Destroyed blocks turning into floor loot is core gameplay state, so silently losing all dropped items on save/reload would feel surprising.
- Persist only the durable subset of dropped-item data:
  - item stack
  - position
  - velocity if needed
  - remaining lifetime if lifetime/despawn is implemented
- If persistence needs to be staged, make that a documented temporary limitation rather than an accidental omission.

### Leave room for future loot behavior
- This dropped-item system should set up future behaviors such as:
  - inventory overflow dropping excess items back into the world
  - mob loot
  - chest spill/drop behavior
  - item magnets or pickup modifiers
- The goal is a general world-item actor path, not a one-off hack for broken blocks only.

## Important Files
- `plans/0019-dropped-item-entities-and-pickups.md`
- `src/types.ts`
- `src/shared/messages.ts`
- `src/client/world-runtime.ts`
- `src/game-app.ts`
- `src/render/renderer.ts`
- `src/server/runtime.ts`
- `src/server/authoritative-world.ts`
- `src/server/world-storage.ts`
- `src/world/inventory.ts`
- `src/world/blocks.ts`
- `tests/client-server.test.ts`
- `tests/storage.test.ts`
- `tests/inventory.test.ts`

## Test Plan
- Drop spawning tests:
  - breaking a collectible block spawns a dropped item entity
  - breaking air or non-collectible blocks does not spawn drops
  - failed mutations do not create duplicate dropped items
- Pickup tests:
  - a nearby player collects a dropped item when inventory space exists
  - full pickup removes the item entity
  - partial pickup leaves the correct remainder entity state
  - full inventory leaves the dropped item on the ground
- Replication tests:
  - client receives nearby dropped item state on join or after spawn
  - spawn, update, and remove events stay in sync with inventory updates
  - multiple players do not both collect the same item stack
- Persistence tests:
  - dropped items survive save/load when persistence is enabled
  - reloading a world preserves item counts and positions
- Manual smoke tests:
  - break a block, confirm it lands on the floor, then walk into it to pick it up
  - fill inventory, break more blocks, and confirm overflow remains in-world
  - save and reload with dropped items present and confirm they persist

## Assumptions And Defaults
- Use the next plan filename in sequence: `0019-dropped-item-entities-and-pickups.md`.
- This feature should follow the player entity-system refactor, not compete with it in the same implementation step.
- Dropped items are server-authoritative entities.
- Chunks remain world resources plus spatial-index keys, not entities.
- Player pickup uses the existing authoritative inventory rules instead of bypassing them.
