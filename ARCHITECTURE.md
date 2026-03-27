# Architecture

## Contents

- [Overview](#overview)
- [Runtime Topology](#runtime-topology)
- [Main App Structure](#main-app-structure)
- [Messaging and Adapters](#messaging-and-adapters)
- [World Ownership Model](#world-ownership-model)
- [World Generation](#world-generation)
- [Content Authoring and Generation](#content-authoring-and-generation)
- [Rendering Pipeline](#rendering-pipeline)
- [Input, Player, and Gameplay Loop](#input-player-and-gameplay-loop)
- [Inventory](#inventory)
- [Chat and Commands](#chat-and-commands)
- [Persistence](#persistence)
- [UI](#ui)
- [Tests](#tests)
- [Future Extension Points](#future-extension-points)

## Overview

Craftvale is a Bun/TypeScript voxel sandbox with a macOS-first native bridge for GLFW and OpenGL. The repo is a Bun workspaces monorepo: `apps/client` (desktop app), `apps/dedicated-server`, `apps/cli` (developer tooling), and `packages/core` (shared gameplay runtime).

The runtime splits into a client side and an authoritative server side:

- **Client** — app shell, rendering, input, menus, and a local replicated world cache.
- **Server** — world generation, persistence, and all authoritative world mutations on a shared fixed-step tick loop. Runs either inside a local Worker for singleplayer or as a dedicated WebSocket server for multiplayer.

Package structure at a glance:

| Package                 | Role                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `apps/client`           | Desktop app bootstrap, `GameApp`, rendering, UI, input, singleplayer worker startup |
| `apps/dedicated-server` | Dedicated WebSocket server process                                                  |
| `apps/cli`              | Native build, dev flow, asset generation scripts                                    |
| `packages/core`         | Shared server runtime, messaging, world gen, content, math                          |
| `native`                | Minimal GLFW/OpenGL C bridge                                                        |

The intended shared import surfaces are `@craftvale/core/shared` and `@craftvale/core/server`. Deep relative cross-workspace imports should be avoided.

## Runtime Topology

### Main thread

The main thread hosts the playable client app:

- Creates the window through `NativeBridge`.
- Owns the render loop and input polling.
- Runs the `GameApp` instance from `apps/client/src/app/game-app.ts`.
- Keeps a replicated `VoxelWorld` for rendering, raycast, and collision.
- Sends typed requests/events to either a worker-backed local server or a WebSocket-backed dedicated server.

### Local worker server

The local worker hosts the authoritative gameplay server for one selected world:

- Boots through `apps/client/src/worker-entry.ts`.
- Is attached to a client-owned `WorkerServerHost` from `apps/client/src/worker/host.ts`.
- Constructs a `ServerRuntime` from `@craftvale/core/server`.
- Generates chunks, applies block mutations, and owns the authoritative state for that one world.
- Saves the world through `BinaryWorldStorage` from `@craftvale/core/server`.

This separation means the client never directly mutates authoritative world state — it asks the server to do so and applies the resulting authoritative updates.

### Dedicated multiplayer server

The dedicated multiplayer path is hosted separately from the desktop app:

- Boots through `apps/dedicated-server/src/index.ts`.
- Starts a `DedicatedServer` and exposes a WebSocket endpoint at `/ws`.
- Creates or loads exactly one world on startup; keeps it authoritative for all connected sessions.

There is no remote world browser. A multiplayer client connects to one saved server entry and joins the server's single authoritative world.

## Main App Structure

`GameApp` in `apps/client/src/app/game-app.ts` is the top-level state owner for the client runtime.

It owns:

- App mode: `menu`, `loading`, or `playing`.
- Menu state, loading-screen state, current world/session metadata.
- Local player identity, transient HUD/status text, chat state.
- Timing state for the fixed-step loop and input edge tracking.
- Lifecycle-managed event-bus subscriptions.

Its dependencies are injected explicitly: `NativeBridge`, `PlayerController`, `VoxelRenderer`, menu seed, client settings storage, and saved-server storage.

The active transport connection is lifecycle-managed by `GameApp`:

- Local singleplayer connects a `WorkerClientAdapter`.
- Remote multiplayer connects a `WebSocketClientAdapter`.
- Each connection owns its own `ClientWorldRuntime`.

The app loop per frame:

1. Poll native input.
2. Advance timing state.
3. If in menu mode — evaluate UI and issue world-management requests.
4. If in loading mode — render the loading screen and wait for startup readiness.
5. If in play mode — run fixed-step gameplay updates.
6. Build HUD/UI data.
7. Render the frame.
8. Yield back to the event loop.

Shutdown is instance-owned: `GameApp` saves the current world, closes the client adapter, and shuts down the native bridge.

## Messaging and Adapters

The client/server boundary is strongly typed through `packages/core/src/shared/messages.ts`, re-exported at `@craftvale/core/shared`.

Three message categories:

- **Client requests** — request/response operations: `joinWorld`, `requestChunks`, `saveWorld`.
- **Client events** — one-way gameplay intents: `mutateBlock`, `selectInventorySlot`, chat submission, player-state updates.
- **Server events** — one-way authoritative updates: `chunkDelivered`, `chunkChanged`, `inventoryUpdated`, `playerUpdated`, chat/system messages, `saveStatus`.

Gameplay events that affect authoritative state are enqueued and applied on the next authoritative server tick. Request/response flows (joining, chunk delivery, saving) run immediately.

`packages/core/src/shared/event-bus.ts` wraps raw transport messages with typed handlers and request correlation.

`packages/core/src/shared/message-codec.ts` serializes typed transport messages for the WebSocket path, including chunk payload byte buffers.

Transport layers:

| Layer                      | Location                         |
| -------------------------- | -------------------------------- |
| `WorkerClientAdapter`      | Client side (singleplayer)       |
| `WorkerServerAdapter`      | Client-owned worker side         |
| `WorkerServerHost`         | `apps/client/src/worker/host.ts` |
| `WebSocketClientAdapter`   | Multiplayer client side          |
| `DedicatedServerTransport` | Dedicated server                 |

Because the transport abstraction is explicit, local and remote play share the same gameplay/message semantics even though their process boundaries differ.

## World Ownership Model

### Client side

`ClientWorldRuntime` owns the replicated client view:

- Loaded chunk cache and pending chunk requests.
- `clientPlayerName`, `clientPlayerEntityId`, and replicated player snapshots.
- Replicated dropped-item and local-player inventory snapshots.
- Recent replicated chat/system messages.

Inventory and dropped-item snapshots are item-based: slots and floor loot carry `ItemId` stack contents, and item metadata drives held-item display and placement affordances on the client.

This local world is used for terrain rendering, remote player rendering, first-person arm/held-item rendering, player collision, voxel raycast/highlight, and HUD display.

### Server side

`AuthoritativeWorld` owns the real gameplay state for one active world session:

- Authoritative chunks, world-level entity state, dirty/save tracking.
- Spawn computation, block mutation rules, and chat-driven command parsing.

`PlayerSystem` operates within that entity state: allocates and restores player entities, owns component mutation and snapshot assembly, and persists per-player position/rotation, gamemode, and inventory.

`DroppedItemSystem` also operates within the shared entity state: allocates dropped-item actors from the same registry, stores transform/stack/pickup-cooldown components, indexes drops by chunk for pickup queries, and persists active floor loot with the world save.

World-level entity state:

- One `EntityRegistry` for actor ids in the active world.
- Component stores for player identity, transform, mode, movement, inventory, session presence, and persistence.
- Component stores for dropped-item transform, stack contents, and pickup cooldown.

Chunks are not entities — chunk data stays coordinate-addressed. World generation, chunk persistence, and chunk resend decisions stay in `AuthoritativeWorld`.

#### World entry warmup

- The authoritative world preloads a bounded startup chunk radius near the joining player's initial position.
- Local worker sessions emit monotonic loading-progress events while that startup area is prepared.
- The client only leaves the loading screen after the joined payload is applied and the required startup chunks are present in the replicated cache.

#### Server responsibilities

- Chunk generation on demand.
- Draining queued gameplay intents on the authoritative tick boundary.
- Simulating dropped items and other world systems once per authoritative tick.
- Batching replication after each tick so clients observe coherent world-state updates.
- Validating and applying block mutations.
- Handling chat-driven commands such as `/gamemode` and `/timeset`.
- Loading, saving, and replicating per-player position, rotation, gamemode, and inventory.
- Resolving broken blocks into dropped item ids and spawning them as dropped item actors.
- Simulating dropped item gravity, cooldown, and pickup checks.
- Deciding which chunks must be resent after a mutation.

## World Generation

World generation is deterministic and seed-driven. The world is 256 blocks tall with sea level at Y 64. Chunks are full-height horizontal columns — `16×256×16` — so runtime streaming works in horizontal areas only.

The worldgen pipeline in `packages/core/src/world/`:

| File            | Role                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `noise.ts`      | Shared deterministic noise helpers                                          |
| `biomes.ts`     | Biome sampling and biome definitions                                        |
| `terrain.ts`    | Terrain heights, cave carving, ore placement, water, tree decoration        |
| `ore-config.ts` | Authored ore-distribution settings (Y range, attempts per chunk, vein size) |

Generation flow per chunk:

1. Sample biome-influenced terrain parameters per world column.
2. Compute terrain height for each `(x, z)` column.
3. Fill top/filler/deep blocks according to the local biome.
4. Fill low terrain up to sea level with static generated water.
5. Deterministic cave-carving pass — may leave enclosed caves or open cave mouths.
6. Deterministic ore-vein pass using ore config, replacing only eligible host stone.
7. Deterministic tree decoration pass.

**Generation is chunk-order safe.** Trees, caves, and ore all sample world-space coordinates but write only within the current chunk column, so generation is deterministic regardless of load order.

## Content Authoring and Generation

Block and item ids are not hand-authored. Content starts from one source and flows through deterministic generation.

### Sources of truth

| File                                           | Role                                       |
| ---------------------------------------------- | ------------------------------------------ |
| `packages/core/src/world/content-spec.ts`      | Authored block/item definitions            |
| `packages/core/src/world/ore-config.ts`        | Ore distribution defaults                  |
| `packages/core/src/world/content-id-lock.json` | Checked-in id stability snapshot           |
| `packages/core/src/world/generated/`           | Generated outputs — do not hand-edit       |
| `apps/client/assets/textures/tiles-src/`       | Authored per-tile PNG source textures      |
| `apps/client/assets/textures/voxel-atlas.png`  | Generated runtime atlas — do not hand-edit |

### Content pipeline

1. Author or edit block/item definitions in `content-spec.ts`.
2. Run `bun run generate:content` to regenerate stable ids and registries.
3. Add or edit referenced tile PNGs in `apps/client/assets/textures/tiles-src/`.
4. Run `bun run generate:atlas` to rebuild the runtime voxel atlas.
5. Run `bun run typecheck` and `bun test`.

### Add a new placeable block-backed item

1. Add a block entry to `AUTHORED_BLOCK_SPECS` — new stable `key`, collision/render/light metadata, `dropItemKey` pointing at the item key.
2. Add an item entry to `AUTHORED_ITEM_SPECS` — `placesBlockKey` and `renderBlockKey` pointing at the block key.
3. If the block uses textures, set `tiles.top`, `tiles.bottom`, and `tiles.side` to names already in `AtlasTiles` (add them if needed).
4. Optionally add an absolute-slot entry to `DEFAULT_STARTER_INVENTORY_STACK_SPECS`.
5. Run `bun run generate:content`.
6. Add or edit matching tile PNGs in `apps/client/assets/textures/tiles-src/`.
7. Run `bun run generate:atlas`.
8. Run `bun run typecheck` and `bun test`.

### Add a block without a player item

Add a block entry in `AUTHORED_BLOCK_SPECS`. Set `dropItemKey` to `null` if breaking it should not create an item drop. Omit any matching item entry unless players need to hold, place, or pick it up. `bedrock` is the current example.

### Add an item without a placeable block

Add an item entry in `AUTHORED_ITEM_SPECS`. Set `placesBlockKey` and `renderBlockKey` to `null`. This is the intended path for future tools, consumables, and ingredients.

### Field guide

| Field               | Description                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `key`               | Stable authoring identity — keep short, lowercase, and durable                                                             |
| `name`              | Player-facing display name                                                                                                 |
| `color`             | Fallback/debug item display color                                                                                          |
| `dropItemKey`       | Item dropped when the block is broken                                                                                      |
| `placesBlockKey`    | Block the item places, if any                                                                                              |
| `renderBlockKey`    | Block mesh used to render the held item, dropped item, and HUD inventory item                                              |
| `renderPass`        | `"opaque"` for solid terrain, `"cutout"` for alpha-discard blocks (e.g. leaves), `null` for non-rendered blocks (e.g. air) |
| `occlusion`         | `"full"` for solid cubes, `"self"` for leaf-style self-culling, `"none"` for non-occluding blocks                          |
| `emittedLightLevel` | Block light emitted, `0`–`15`                                                                                              |

### Tile texture rules

- One `16×16` RGBA PNG per tile id in `apps/client/assets/textures/tiles-src/` (e.g. `dirt.png`, `grass-top.png`).
- Tile ids must align with `AtlasTiles` and the tile names referenced from `content-spec.ts`.
- After changing any source tile PNG, run `bun run generate:atlas`.
- `bun run generate:tile-sources` regenerates the default tile PNG set from code — normal art iteration should edit PNGs in `tiles-src` directly.

### Id stability rules

- Do not hand-pick numeric ids — the generator assigns them.
- Do not reorder generated files by hand — the generator and lockfile own the final ids.
- Adding a new key appends a new id while preserving existing ids.
- Renaming or removing a key is a compatibility-sensitive change — existing saves may reference the old ids. Update `content-spec.ts` and `content-id-lock.json` together and treat it as a migration or save-reset decision.

### Example: add a glowing placeable block

1. Add a block spec `blue_lantern` with tiles, `emittedLightLevel`, and `dropItemKey: "blue_lantern"`.
2. Add a matching item spec with `placesBlockKey: "blue_lantern"` and `renderBlockKey: "blue_lantern"`.
3. Optionally add `"blue_lantern"` to `DEFAULT_STARTER_INVENTORY_STACK_SPECS`.
4. Run `bun run generate:content` and review the diff in `content-id-lock.json` and `generated/*`.

## Rendering Pipeline

`VoxelRenderer` in `apps/client/src/render/renderer.ts` owns rendering.

Pipeline per frame:

1. Build or refresh chunk meshes from the replicated client world.
2. Render opaque voxel faces.
3. Render opaque dropped-item cubes.
4. Render opaque remote-player body parts.
5. Render cutout voxel faces.
6. Render cutout dropped-item cubes.
7. Render the focused-block highlight.
8. Render the local first-person arm and held block.
9. Render text overlay.
10. Render UI overlay (play HUD and crosshair).

Key details:

- Voxel textures come from a shared atlas; directional face shading is applied in the shader.
- Remote players are rendered as dynamic cube-based actors, not chunk-meshed terrain.
- The local first-person arm uses the same cube-based visual language, drawn as a late viewmodel-style pass.
- Leaves use alpha-cutout rendering, not full sorted translucency.
- Terrain meshing is split into opaque and cutout passes.
- Dropped items render as lightweight atlas-textured cubes outside terrain meshing.
- The play HUD is composed from lightweight rectangle/text overlays rather than a separate retained UI layer.

The native bridge in `apps/client/src/platform/native.ts` and `native/bridge.c` exposes the minimal GLFW/OpenGL surface needed by the renderers.

## Input, Player, and Gameplay Loop

The native bridge polls input every frame and returns a plain `InputState`.

`PlayerController` owns FPS movement, creative flight toggling, gravity/jump behavior, collision checks against the replicated world, and camera/view-projection state.

Gameplay updates per tick:

- Requesting nearby chunks.
- Movement and collision.
- Raycasting from the eye position.
- Sending local player-state updates for the server's authoritative snapshot.
- Receiving replicated dropped-item spawn/update/remove events.
- Picking up nearby dropped items after server validation (proximity, cooldown, inventory space).
- Opening chat, submitting chat lines, routing slash commands through the server.
- Receiving authoritative world-time updates after server-side `/timeset` changes.
- Breaking blocks and placing the selected hotbar block through server events.
- Selecting inventory slots with number keys `1`–`9`.

The client never assumes a local placement or removal succeeded until the authoritative server sends updated chunks and/or inventory.

## Inventory

Player identity is separate from world identity — each client has a persisted player name stored in local client metadata, optionally overridden at launch with `--player-name`.

Inventory is modeled as one canonical snapshot: an ordered slot list, a selected hotbar index, and an optional carried cursor stack. The default setup is a nine-slot hotbar with starter stacks for new players.

The client uses the replicated inventory for hotbar display, inventory overlay layout, placement selection, and local feedback (e.g. out-of-stock messages).

The server owns the real counts and persists them per player name inside each world:

- Breaking collectible blocks increments counts.
- Successful placement decrements counts; invalid placement does not consume inventory.
- Joining the same world with the same player name restores that player's inventory and position/rotation.

Inventory is player-owned state (not a standalone entity), mutated through `PlayerSystem`, and replicated separately from chunk replication.

## Chat and Commands

Chat is a client-visible session feature backed by server events:

- The client opens chat from the gameplay loop and submits plain text.
- Slash-prefixed lines are parsed on the server as commands; non-slash lines are replicated as normal player chat.
- Command feedback is emitted as system chat messages.

Supported commands: `/gamemode`, `/timeset`, `/seed`, `/teleport`, `/save`.

- `/gamemode 0` — normal grounded movement.
- `/gamemode 1` — creative-mode flight; double-tap `Space` to toggle flying, `Shift` to descend.

## Persistence

Implemented in `packages/core/src/server/world-storage.ts`.

Persisted data:

- World registry metadata.
- Per-world chunk override files.
- Per-world per-player files containing player snapshot and inventory data.

The save model is baseline-aware: generated chunks are deterministic from the world seed, so only changed chunks need to be persisted. If a chunk matches its regenerated baseline again, its override file is removed. This keeps storage focused on player-caused differences rather than caching the full generated world.

## UI

UI is intentionally lightweight and code-driven:

| File                               | Role                                        |
| ---------------------------------- | ------------------------------------------- |
| `apps/client/src/ui/menu.ts`       | Menu layout generation                      |
| `apps/client/src/ui/hud.ts`        | Play HUD and crosshair composition          |
| `apps/client/src/ui/components.ts` | Panel/label/button model and hit evaluation |
| `apps/client/src/ui/renderer.ts`   | Draws UI rectangles and text                |

The menu is evaluated each frame from state plus pointer input rather than maintained through a retained widget tree. In play mode, the hotbar, selected-item label, and crosshair follow the same code-driven overlay model.

## Tests

The test suite covers the main architectural seams:

- Client/server request-response behavior and authoritative chunk/inventory replication.
- Storage round-trips and shared world entity ownership for player allocation.
- Terrain and biome determinism, meshing and atlas behavior.
- Hotbar normalization and HUD composition.
- Player collision and movement.
- Worker-host lifecycle behavior.

This matters because the architecture depends heavily on deterministic generation and explicit ownership boundaries.

## Future Extension Points

The current architecture should support future work such as:

- Alternate transports beyond worker-backed local play.
- Richer biome/decorator systems.
- More inventory/content systems.
- Improved renderer resource cleanup and lifecycle.
- Larger app-shell testing surface through injected fakes.
