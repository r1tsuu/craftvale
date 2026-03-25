# Architecture

## Overview

This project is a Bun/TypeScript voxel sandbox with a macOS-first native bridge for GLFW and OpenGL. The repo is organized as a Bun workspaces monorepo with an explicit desktop client app, an explicit dedicated-server app, and a shared core package. The runtime is still split into a client side and an authoritative server side: the client runs the app shell, rendering, input, menu, and local replicated world cache, while the authoritative server runs either inside a local Worker for singleplayer or as a dedicated WebSocket server for multiplayer and owns world generation, persistence, and all authoritative world mutations on a shared fixed-step tick loop.

At a high level:

- `apps/client/src/index.ts` is the desktop-app bootstrap.
- `apps/client/src/game-app.ts` owns the main application state and loop.
- `apps/client/src/client/*`, `render/*`, `ui/*`, `game/*`, and `platform/*` implement client runtime behavior, rendering, input, menus, HUD, and native integration.
- `apps/client/src/worker/*` owns singleplayer worker bootstrap and worker-only transport glue.
- `apps/client/assets/*` contains runtime-loaded client shaders and textures.
- `apps/cli/src/*` owns repo-level developer tooling such as native builds, combined dev startup, cleanup, and asset generation.
- `apps/dedicated-server/src/index.ts` is the dedicated WebSocket server bootstrap.
- `packages/core/src/server/*` implements authoritative world/session behavior and storage.
- `packages/core/src/shared/*` defines typed messaging, transport, and event-bus plumbing.
- `packages/core/src/world/*` contains deterministic worldgen, chunk data, meshing, atlas metadata/UVs, item/inventory helpers, and raycasting.
- `packages/core/src/math/*` and `packages/core/src/utils/*` provide shared helpers, including CLI parsing, logging, and reusable port-availability checks.
- `native/*` bridges Bun to GLFW/OpenGL.

The intended shared import surfaces are:

- `@craftvale/core/shared`
- `@craftvale/core/server`

## Runtime Topology

### Main thread

The main thread hosts the playable client app:

- creates the window through `NativeBridge`
- owns the render loop and input polling
- runs the `GameApp` instance
- keeps a replicated `VoxelWorld` for rendering, raycast, and collision
- sends typed requests/events to either a worker-backed local server or a WebSocket-backed dedicated server

### Local worker server

The local worker hosts the authoritative gameplay server for one selected world:

- boots through `apps/client/src/worker-entry.ts`
- is attached to a client-owned `WorkerServerHost` from `apps/client/src/worker/host.ts`
- constructs a `ServerRuntime` from `@craftvale/core/server`
- is initialized with one chosen local world record
- saves that world through `BinaryWorldStorage` from `@craftvale/core/server`
- generates chunks, applies block mutations, and owns the authoritative state for that one world

This separation means the client never directly mutates authoritative world state. It asks the server to do so and then applies the resulting authoritative updates.

### Dedicated multiplayer server

The dedicated multiplayer path is hosted separately from the desktop app:

- boots through `apps/dedicated-server/src/index.ts`
- starts a `DedicatedServer`
- exposes a WebSocket endpoint at `/ws`
- creates or loads exactly one world on startup
- keeps that one world authoritative for all connected sessions

There is no remote world browser in this mode. A multiplayer client connects to one saved server entry and joins the server's single authoritative world.

## Main App Structure

`GameApp` in `apps/client/src/game-app.ts` is the top-level state owner for the client runtime.

It owns:

- app mode (`menu`, `loading`, or `playing`)
- menu state
- loading-screen state for in-flight world entry
- current world/session metadata
- the local player identity used for joins
- transient HUD/status text
- chat-open state and draft text
- timing state for the fixed-step loop
- input edge tracking such as previous mouse button state
- lifecycle-managed event-bus subscriptions

Its dependencies are injected explicitly:

- `NativeBridge`
- `PlayerController`
- `VoxelRenderer`
- menu seed
- client settings storage
- saved-server storage

The active transport connection is lifecycle-managed by `GameApp`:

- local singleplayer connects a `WorkerClientAdapter`
- remote multiplayer connects a `WebSocketClientAdapter`
- each connection owns its own `ClientWorldRuntime`

The app loop roughly does this every frame:

1. Poll native input.
2. Advance timing state.
3. If in menu mode, evaluate UI and issue world-management requests.
4. If in loading mode, render the loading screen and wait for startup readiness.
5. If in play mode, run fixed-step gameplay updates.
6. Build HUD/UI data.
7. Render the frame.
8. Yield back to the event loop.

Shutdown is also instance-owned. `GameApp` saves the current world, closes the client adapter, and shuts down the native bridge.

## Messaging And Adapters

The client/server boundary is strongly typed through `packages/core/src/shared/messages.ts` and re-exported at `@craftvale/core/shared`.

There are three main categories:

- client requests: request/response operations such as `joinWorld`, `requestChunks`, and `saveWorld`
- client events: one-way gameplay intents such as `mutateBlock`, `selectInventorySlot`, chat submission, and player-state updates
- server events: one-way authoritative updates such as `chunkDelivered`, `chunkChanged`, `inventoryUpdated`, `playerUpdated`, chat/system messages, and `saveStatus`

Gameplay events that affect authoritative state are now enqueued and applied on the next authoritative server tick instead of mutating the world directly in transport handlers. Request/response flows such as joining, chunk delivery, and saving still run immediately.

`packages/core/src/shared/event-bus.ts` wraps raw transport messages with typed handlers and request correlation.

Current transport layers:

- `WorkerClientAdapter` on the client side
- `WorkerServerAdapter` on the client-owned singleplayer worker side
- `WorkerServerHost` inside `apps/client/src/worker/host.ts`
- `WebSocketClientAdapter` on the multiplayer client side
- `DedicatedServerTransport` inside the dedicated server

`packages/core/src/shared/message-codec.ts` serializes typed transport messages for the WebSocket path, including chunk payload byte buffers.

Because the transport abstraction is explicit, local and remote play can share the same gameplay/message semantics even though their process boundaries differ.

## World Ownership Model

### Client side

`ClientWorldRuntime` owns the replicated client view of the world:

- loaded chunk cache
- pending chunk requests
- chunk waiters for async loading
- `clientPlayerName` and `clientPlayerEntityId` plus replicated player snapshots
- replicated dropped-item snapshots keyed by world entity id
- replicated local-player inventory snapshot
- recent replicated chat/system messages

Those replicated inventory and dropped-item snapshots are item-based:

- inventory slots carry `ItemId` stack contents
- dropped floor loot carries `ItemId` stack contents
- item metadata, not raw block metadata, drives held-item display and placement affordances on the client

This local world is used for:

- terrain rendering
- remote player rendering
- local first-person arm and held-item rendering inputs
- player collision
- voxel raycast/highlight
- HUD/hotbar display

### Server side

`AuthoritativeWorld` owns the real gameplay state for one active world session:

- authoritative chunks
- world-level entity state and shared entity id space
- dirty/save tracking
- spawn computation
- block mutation rules
- command parsing for chat-driven server gameplay commands

`PlayerSystem` operates within that world-owned entity state:

- allocates and restores player entities from the shared world registry
- owns player-specific component mutation and snapshot assembly
- persists per-player position/rotation, gamemode, and inventory state

`DroppedItemSystem` also operates within that shared world-owned entity state:

- allocates dropped-item actors from the same registry as players
- stores dropped-item transform, stack, and pickup-cooldown components
- indexes dropped items by chunk for pickup queries
- persists active floor loot with the world save

The shared world entity state currently includes:

- one `EntityRegistry` for actor ids in the active world
- world-owned component stores for player identity, transform, mode, movement, inventory, session presence, and persistence
- world-owned component stores for dropped-item transform, stack contents, and pickup cooldown
- a boundary that future actor systems can share without making chunks into entities

Chunks still are not entities:

- chunk data remains coordinate-addressed world resources
- world generation, chunk persistence, and chunk resend decisions stay in `AuthoritativeWorld`

World entry now also has a startup warmup path:

- the authoritative world preloads and persists a bounded startup chunk radius near the joining player's initial position
- local worker sessions emit monotonic loading-progress events while that startup area is prepared
- the client only leaves the loading screen after the joined payload is applied and the required startup chunks are present in the replicated cache

The server is responsible for:

- chunk generation on demand
- draining queued gameplay intents on the authoritative tick boundary
- simulating dropped items and other world systems once per authoritative tick
- batching replication after each authoritative tick so clients observe coherent world-state updates
- bounded startup-area pregeneration before local world entry completes
- validating and applying block mutations
- loading, saving, and replicating per-player position/rotation state
- loading, saving, and replicating per-player gamemode state
- deducting placed items from the authoritative inventory
- resolving selected items into placeable block ids during placement validation
- resolving broken blocks into dropped item ids instead of treating blocks as inventory identities
- spawning collectible block breaks as dropped item actors instead of direct inventory grants
- simulating dropped item gravity, cooldown, and pickup checks
- awarding picked-up items through the same authoritative inventory rules
- deciding which chunks must be resent after a mutation
- persisting changed state

## World Generation

World generation is deterministic and seed-driven.

The worldgen pipeline currently lives under `packages/core/src/world/*`:

- `noise.ts`: shared deterministic noise helpers
- `biomes.ts`: biome sampling and biome definitions
- `terrain.ts`: biome-aware terrain heights, surface blocks, and tree decoration

The generation flow for a chunk is:

1. Sample biome-influenced terrain parameters per world column.
2. Compute the terrain height for each `(x, z)` column.
3. Fill top/filler/deep blocks according to the local biome.
4. Run a deterministic decoration pass for trees.

Important property: generation is chunk-order safe.

Trees are not created by mutating neighboring chunks after the fact. Instead, decoration samples candidate structure anchors in world space and writes only the voxels that fall inside the current chunk. That keeps generation deterministic regardless of load order.

## Rendering Pipeline

Rendering is handled by `VoxelRenderer` in `apps/client/src/render/renderer.ts`.

The pipeline is:

1. Build or refresh chunk meshes from the replicated client world.
2. Render opaque voxel faces.
3. Render opaque dropped-item cubes.
4. Render opaque remote-player body parts.
5. Render cutout voxel faces.
6. Render cutout dropped-item cubes.
7. Render the focused-block highlight.
8. Render the local first-person arm and held block.
9. Render text overlay.
10. Render UI overlay, including the play HUD and crosshair.

Important rendering details:

- voxel textures come from a shared atlas
- directional face shading is applied in the shader
- remote players are rendered as dynamic cube-based actors, not chunk-meshed terrain
- the local first-person arm uses the same cube-based visual language but is drawn as a late viewmodel-style pass
- leaves use alpha-cutout rendering, not full sorted translucency
- terrain meshing is split into opaque and cutout passes
- dropped items render as lightweight atlas-textured cubes outside terrain meshing
- the play HUD is composed from lightweight rectangle/text overlays rather than a separate retained UI layer

The native bridge in `apps/client/src/platform/native.ts` and `native/bridge.c` exposes the minimal GLFW/OpenGL surface needed by the renderers.

## Input, Player, And Gameplay Loop

The native bridge polls input every frame and returns a plain `InputState`.

`PlayerController` owns:

- FPS movement
- creative flight toggling and flying movement
- gravity/jump behavior
- collision checks against the replicated world
- camera/view-projection state

Gameplay updates currently include:

- requesting nearby chunks
- movement and collision
- raycasting from the eye position
- sending local player-state updates so the server can own the authoritative snapshot
- receiving replicated dropped-item spawn/update/remove events
- picking up nearby dropped items only after the server validates proximity, cooldown, and inventory space
- opening chat, submitting chat lines, and routing slash commands through the server
- breaking blocks through a server event
- placing the selected hotbar block through a server event
- selecting inventory slots with number keys `1..9`

The client never assumes a local placement/removal succeeded until the authoritative server sends updated chunks and/or inventory.

## Inventory

Player identity is separate from world identity:

- each client has a persisted player name stored in local client metadata
- a launch can temporarily override that name with `--player-name`
- the effective player name is sent explicitly when joining a world

Inventory is modeled as a fuller player inventory snapshot:

- hotbar slot list
- main inventory slot list
- selected hotbar index
- optional carried cursor stack

The current default setup is a nine-slot hotbar with starter stacks for newly seen players.

The client uses this replicated inventory for:

- hotbar HUD display
- current placement selection
- local feedback such as out-of-stock messages

The server owns the real counts and persists them per player name inside each world:

- breaking collectible blocks increments counts
- successful placement decrements counts
- invalid placement does not consume inventory
- joining the same world with the same player name restores that player’s inventory and position/rotation

Within the current server architecture, inventory still belongs to the player entity/component model:

- inventory is player-owned state, not a standalone entity
- inventory mutation is routed through `PlayerSystem`
- inventory replication still stays separate from chunk replication

## Chat And Commands

Chat is a client-visible session feature backed by server events:

- the client opens chat from the gameplay loop and submits plain text
- slash-prefixed lines are parsed on the server as commands
- non-slash lines are replicated as normal player chat
- command feedback is emitted as system chat messages

The first command path is `/gamemode`:

- `/gamemode 0` restores the normal grounded movement model
- `/gamemode 1` enables creative-mode flight support
- double-tapping `Space` toggles flying while in creative mode
- `Shift` descends while flight is active

Inventory normalization also keeps persisted snapshots structurally safe when slot layouts or block catalogs grow.

## Persistence

Persistence is implemented in `packages/core/src/server/world-storage.ts`.

Current persisted data:

- world registry metadata
- per-world chunk override files
- per-world per-player files containing player snapshot and inventory data

The save model is baseline-aware:

- generated chunks are deterministic from the world seed
- only changed chunks need to be persisted
- if a chunk matches regenerated baseline data again, its override file can be removed

This keeps storage focused on player-caused differences instead of caching the full generated world.

## UI

UI is intentionally lightweight and code-driven.

The main pieces are:

- `apps/client/src/ui/menu.ts`: menu layout generation
- `apps/client/src/ui/hud.ts`: play HUD and crosshair composition
- `apps/client/src/ui/components.ts`: simple panel/label/button model plus hit evaluation
- `apps/client/src/ui/renderer.ts`: draws UI rectangles and text

The menu is evaluated each frame from state plus pointer input rather than maintained through a retained widget tree.

In play mode, the hotbar, selected-item label, and centered crosshair follow the same code-driven overlay model and are rendered through the existing rectangle/text UI path.

## Tests

The test suite covers the main architectural seams:

- client/server request-response behavior
- authoritative chunk/inventory replication
- storage round-trips
- shared world entity ownership for player allocation
- terrain and biome determinism
- meshing and atlas behavior
- hotbar normalization and HUD composition
- player collision and movement
- worker-host lifecycle behavior

This matters because the architecture depends heavily on deterministic generation and explicit ownership boundaries.

## Design Principles

The current codebase leans on a few consistent principles:

- authoritative server state, even in single-player
- deterministic procedural generation from world seed
- explicit instances for stateful runtime behavior
- typed message boundaries between subsystems
- small native surface area with most logic in TypeScript
- data-oriented worldgen/config where possible

## Likely Future Extension Points

The current architecture should support future work such as:

- alternate transports beyond worker-backed local play
- richer biome/decorator systems
- more inventory/content systems
- headless or dedicated-server modes
- improved renderer resource cleanup/lifecycle
- larger app-shell testing surface through injected fakes
