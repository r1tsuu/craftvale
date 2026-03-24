# Player Entity-System Refactor

## Summary
Refactor the current player implementation from a set of player-specific maps and singleton assumptions into a small entity-system layer that can own players cleanly and make future dynamic world actors easier to add. The first pass should stay disciplined: introduce entity-oriented modeling for players and nearby actor-like gameplay state, but do not convert terrain chunks into ECS entities. Chunks should remain addressable world resources, and the player inventory should remain a player-owned component/value object rather than becoming its own entity in this pass.

## Key Changes

### Introduce a lightweight entity-system foundation
- Add a small server-authoritative entity layer instead of scattering actor state across unrelated maps.
- Keep the implementation intentionally simple:
  - stable `EntityId`
  - typed component stores
  - a small set of systems that iterate known entity sets
  - clear serialization boundaries for persistence and replication
- Avoid importing a large generic ECS library unless the repo truly needs one; a local, purpose-built entity registry will be easier to evolve with the current worker architecture.

### Model players as entities with components
- Replace the current `Map<PlayerName, ServerPlayerEntry>` style server state with player entities that carry player-focused components.
- Recommended first-pass player components:
  - `PlayerIdentityComponent` with player name and persistence key
  - `TransformComponent` for position and rotation
  - `MovementStateComponent` for grounded/flying/velocity-like runtime state
  - `PlayerModeComponent` for gamemode and permissions
  - `InventoryComponent` containing the existing authoritative inventory snapshot
  - `SessionPresenceComponent` for active/inactive connection state
- Keep `PlayerName` as the user-facing and persistence-facing identifier, but stop using it as the only internal key.

### Keep chunks out of the entity system
- Strong recommendation:
  - do not make terrain chunks entities in this refactor
- The current chunk model is coordinate-addressed, persistence-heavy, and tightly tied to world generation, meshing, and storage revisions.
- Converting chunks into entities now would add complexity without helping the immediate player/dropped-item goals.
- Better boundary:
  - chunks stay in `AuthoritativeWorld` as world resources
  - entity systems query chunk/block data through world-resource APIs
  - spatial indexing for entities may still use chunk coordinates, but that does not require chunks to become entities

### Keep inventory as a player-owned component, not a separate entity
- Strong recommendation:
  - keep player inventory as data owned by the player entity
- The current inventory model is authoritative, per-player, and already fits naturally as a component/value object.
- Making inventory its own entity now would complicate ownership and persistence without providing a clear win.
- A separate inventory/container entity becomes more compelling later for:
  - chests
  - furnaces
  - shared containers
  - corpse/loot containers
- For this refactor, inventory should stay embedded in a player-facing component and continue using the shared inventory helper logic.

### Refactor server systems around entity ownership
- Split current `AuthoritativeWorld` responsibilities into clearer systems operating on the entity registry plus world resources.
- Likely first-pass systems:
  - player join/leave system
  - player snapshot replication system
  - player state update system
  - inventory selection/interact system
  - player persistence load/save system
- Keep block mutation, chunk loading, and world save orchestration authoritative on the server, but route player-specific consequences through player components instead of singleton fields.

### Remove singleton assumptions from server runtime
- The current runtime still has a `currentPlayerName` shortcut that assumes one active input owner at a time.
- Refactor request/event handling so player-targeted actions resolve through explicit player identity and then to entity ids internally.
- This plan should preserve the current client/server ownership model:
  - the client sends intents for its local player
  - the server resolves that player entity
  - the server mutates authoritative components and replicates snapshots back

### Mirror player entities cleanly on the client
- The client does not need a full gameplay ECS immediately, but it should be able to mirror entity-oriented player snapshots cleanly.
- Recommended first pass:
  - keep `ClientWorldRuntime.players`
  - add explicit entity ids to replicated player snapshots or adjacent DTOs
  - preserve `clientPlayerName` for local ownership and UI
- `PlayerController` can remain the local movement/camera owner for now, but it should sync with a clearly defined local-player entity snapshot instead of leaning on older singleton assumptions.

### Define entity-aware protocol payloads
- Update shared message types so replicated player state has room for an internal entity identity while preserving player-name semantics for UX and saves.
- Likely changes:
  - add `entityId` to replicated player payloads
  - make join responses and player update events entity-aware
  - ensure future non-player actors can reuse the same replication patterns
- Keep transport neutrality intact so the worker-backed setup remains compatible with a later network transport.

### Preserve persistence by serializing components into player records
- World saves should continue to store per-player state in a shape that is easy to version and debug.
- Recommended persistence boundary:
  - serialize player entities into player save records keyed by player name
  - only persist durable components such as transform, gamemode, and inventory
  - avoid persisting transient session-only components directly
- This keeps the data format stable while allowing the runtime to become more entity-oriented internally.

### Leave room for future non-player actors
- The entity-system foundation should be shaped so later actors can reuse it:
  - dropped items
  - mobs
  - projectiles
  - temporary world interactions
- The goal is not to build a huge generic framework now; it is to stop hard-coding player-only assumptions in ways that block those next features.

## Important Files
- `plans/0018-player-entity-system-refactor.md`
- `architecture.md`
- `src/types.ts`
- `src/shared/messages.ts`
- `src/client/world-runtime.ts`
- `src/game/player.ts`
- `src/game-app.ts`
- `src/server/runtime.ts`
- `src/server/authoritative-world.ts`
- `src/server/world-storage.ts`
- `src/world/inventory.ts`
- `tests/client-server.test.ts`
- `tests/storage.test.ts`

## Test Plan
- Entity registry tests:
  - player entity creation assigns stable entity ids
  - removing or deactivating a player does not corrupt other entities
  - component lookups remain isolated by entity id
- Player lifecycle tests:
  - joining a world creates or restores a player entity from the persisted player record
  - reconnecting the same player name reuses the correct saved state
  - multiple players can coexist without singleton-state conflicts
- Replication tests:
  - join responses expose the local player plus remote player snapshots with stable identity
  - player updates target the correct replicated entity
  - local input only affects the intended player entity
- Inventory regression tests:
  - selected slot and inventory interactions still mutate the correct player-owned inventory component
  - inventory persistence still round-trips through save/load
- Manual smoke tests:
  - join a world, move, save, reload, and confirm player state is preserved
  - connect more than one player identity and confirm state separation remains correct
  - verify player UI/HUD logic still follows the local player only

## Assumptions And Defaults
- Use the next plan filename in sequence: `0018-player-entity-system-refactor.md`.
- The first ECS-style refactor targets players first, not chunks.
- Chunks remain world resources keyed by chunk coordinates.
- Player inventory remains a player-owned component/value object, not a standalone entity.
- This plan is intended to prepare for dropped items and future actors without forcing a whole-engine ECS rewrite all at once.
