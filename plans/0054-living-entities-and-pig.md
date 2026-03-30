# Living Entities And Pig

## Summary

Add the first non-player living mob: a pig that wanders around randomly.

Before adding pig-specific behavior, refactor the current player-centric actor
model into a shared `LivingEntity` foundation so players and animals can reuse
core movement, snapshots, replication, and rendering concepts.

The first pig pass should stay intentionally simple:

- server-authoritative pig entities
- random wandering only
- no breeding, attacking, riding, drops, or sounds yet

## Goals

- Introduce a shared `LivingEntity` architecture that can support both players
  and mobs.
- Keep the server authoritative for pig spawning, movement, and replication.
- Add a pig entity type that exists in the world as a real actor, not a fake
  client-only decoration.
- Make pigs wander around randomly with simple idle/turn/move behavior.
- Spawn pigs randomly on grass blocks.
- Replicate pigs to clients so they render alongside players and dropped items.
- Implement a real pig 3D model and texture for rendering.
- Keep the design extensible for future animals and hostile mobs.

## Non-Goals

- Pig interaction mechanics
- Pig drops or death
- Breeding or herd AI
- Pathfinding around complex terrain
- Animation polish beyond a minimal readable motion state
- Multiple animal species in the same pass

## Proposed Design

### 1. Refactor toward a shared `LivingEntity` model first

Right now players are special-cased through player-specific components,
snapshots, and systems. Before adding animals, introduce a shared layer for
common living-actor concepts such as:

- world position / yaw
- active/alive state
- movement-related data
- replicated living snapshot shape

Recommended first pass:

- keep player inventory, gamemode, and session ownership as player-only
  components
- move transform / basic locomotion concepts toward shared living components or
  shared snapshot assembly helpers
- avoid forcing dropped items or block entities into this abstraction

This should create a clean split:

- `LivingEntity`: players + animals
- `Player`: living entity + player-only state
- `Animal/Pig`: living entity + animal-only state

### 2. Add pig entity identity and server-owned state

Introduce a pig actor type in the authoritative world entity state with the
minimum data needed for wandering:

- entity id
- living transform
- pig marker/type
- movement timer / idle timer / target yaw / current intent

Pigs should be spawned and owned by the server, similar in spirit to dropped
items, but through living-entity systems rather than item simulation.

### 3. Add a simple server-side wandering system

The first AI should be deliberately lightweight and deterministic enough for a
server tick loop:

- idle for a short random duration
- pick a random heading
- walk for a short random duration
- stop when blocked or near an edge if simple safety checks are available

Recommended first pass:

- no full pathfinding
- horizontal wandering only
- simple gravity/ground adherence shared with living movement where possible
- clamp or cancel movement when terrain is invalid rather than trying to solve
  complex navigation

### 4. Replicate pigs through shared living snapshots

Clients need a replicated snapshot for pigs the same way they do for players.

Preferred direction:

- add a shared replicated living-entity message/snapshot surface
- preserve existing player replication behavior
- let pigs reuse the transport/event flow instead of inventing a one-off pig
  channel

This may mean:

- introducing a more general entity-updated event for non-player living actors,
  or
- extending the existing runtime with a dedicated non-player living stream if
  that fits the current architecture better

The important part is avoiding another player-only rendering/data path.

### 5. Reuse living rendering concepts on the client

Players already have a blocky model/render path. Pigs should reuse as much of
that pipeline shape as practical:

- shared world-entity render collection
- pig-specific model geometry
- pig-specific texture data/material selection
- shared transform/orientation handling where possible

The pig should not be rendered by hacking the player renderer directly, but the
player renderer/model stack should inform a general living-entity rendering
structure.

Recommended first pass:

- add a dedicated pig model definition with simple cuboid body parts
- add a dedicated pig texture/atlas mapping
- keep the visual style consistent with the current player/block art direction
- support at least a readable standing pose and basic facing rotation

If useful, this can introduce a small shared living-model layer so player and
pig model code are parallel rather than duplicated ad hoc.

### 6. Spawn strategy for first pass

Keep spawning minimal and explicit for the initial feature, but place pigs in a
way that already feels world-native.

Recommended first pass:

- pick random candidate positions in the loaded/startup area
- only spawn pigs when the surface block is grass
- place the pig above that grass surface
- keep the total pig count small and deterministic enough for tests

This avoids needing a full biome/ecosystem spawning system in the same pass.

A later plan can add:

- biome-based spawn rules
- despawn rules
- population caps

## Important Files

- `plans/0054-living-entities-and-pig.md`
- `architecture.md`
- `packages/core/src/types.ts`
- `packages/core/src/shared/messages.ts`
- `packages/core/src/server/world-entity-state.ts`
- `packages/core/src/server/entity-system.ts`
- `packages/core/src/server/player-system.ts`
- `packages/core/src/server/authoritative-world.ts`
- `packages/core/src/server/runtime.ts`
- `packages/core/src/server/world-tick.ts`
- `packages/core/src/server/dropped-item-system.ts`
- `apps/client/src/app/world-runtime.ts`
- `apps/client/src/render/renderer.ts`
- `apps/client/src/render/player-preview-overlay.ts`
- `apps/client/src/render/player-model.ts`
- `apps/client/src/render/player-renderer.ts`
- `apps/client/src/render/*pig*`
- `apps/client/assets/textures/*`
- `apps/cli/src/default-voxel-tile-sources.ts`
- `tests/authoritative-world.test.ts`
- `tests/client-server.test.ts`
- `tests/player-render.test.ts`

## Test Plan

- Server tests:
  - living-entity refactor preserves existing player behavior
  - pigs can be created and ticked without breaking player systems
  - pig wandering updates authoritative position over time
- Replication tests:
  - pig snapshots reach clients
  - reconnect / join flow includes nearby pigs consistently
- Render tests:
  - pig render path can draw at least one pig instance
  - pig model/texture assets are wired correctly into the renderer
  - player rendering remains unchanged after the shared refactor
- Manual:
  - join a world
  - observe at least one pig spawned on grass near the startup area
  - verify the pig has the intended 3D model and texture in-world
  - verify it idles, turns, and walks around on its own
  - verify players still move/render normally

## Notes

- The key architectural requirement here is not the pig itself, but preventing
  “player-only actor” assumptions from hardening further.
- This plan should prefer a clean shared living-entity base over shipping a pig
  quickly with duplicated player logic.

## Implementation Notes

- Players now share a `LivingEntity` foundation for type, transform, and active
  state, while keeping player-only inventory and gamemode data separate.
- Pigs are server-owned entities with a dedicated `PigSystem` that handles
  deterministic grass spawning and simple idle/walk wandering on tick.
- Pig replication currently uses a dedicated `pigUpdated` stream plus `pigs` in
  the join payload, while still reusing shared living snapshot and render
  concepts underneath.
- Pig rendering reuses the cuboid living-entity path alongside the existing
  player preview/viewmodel setup, with dedicated pig material blocks and atlas
  textures.
