# Craftvale

A macOS-first Bun desktop voxel sandbox with a thin C bridge for GLFW windowing and OpenGL rendering. The repo now uses Bun workspaces so the desktop client, dedicated server, and shared gameplay/runtime code live in explicit packages instead of one flat source tree.

## Current Features

- GLFW window creation and OpenGL 3.3 core rendering through a Bun FFI bridge
- Textured voxel rendering with a shared atlas and directional face shading
- Opaque and cutout terrain passes for solid blocks and transparent leaves
- Chunked voxel terrain with biome-aware procedural generation
- Forest, plains, scrub, and highlands-style world regions
- Deterministic tree generation with chunk-safe cross-border placement
- First-person camera with grounded FPS movement
- Jump, gravity, and voxel collision
- Centered in-game crosshair
- Focused block highlight
- Server-authoritative block breaking and placing through local worker transport or dedicated WebSocket server transport
- Stable per-client player names with local profile persistence and optional `--player-name` override
- Player-aware authoritative sessions with per-player position, rotation, and inventory state
- Rendered remote players with Minecraft-like cuboid bodies
- World-level server entity state with shared entity ids for authoritative actors
- Dedicated `PlayerSystem` operating within that shared world entity state
- Server-authoritative dropped item entities with floor spawning, pickups, and persistence
- In-game chat with slash-command submission and system feedback
- Server-authoritative `/gamemode 0` and `/gamemode 1` command handling
- Creative-mode flight toggled by double-tapping `Space`
- Per-world save/load with named worlds and binary chunk persistence
- Server-authoritative full inventory with a 9-slot hotbar, main storage grid, stack movement, and per-player persistence
- Separate item and block registries, with explicit item-to-block placement and block-to-item drop mappings
- Nine placeable hotbar items for terrain, wood, and masonry-style blocks
- Create, join, delete, and save worlds from the menu
- Multiplayer server browser with saved servers, a built-in localhost entry, add/delete controls, and direct join flow
- Explicit world loading screen for local singleplayer and multiplayer joins
- Server-authoritative startup chunk pregeneration around the initial entry area
- Pre-game menu with reusable UI components and clickable buttons
- Seeded Minecraft-like menu background
- On-screen HUD text for FPS, position, rotation, world name, and status
- Bottom-center hotbar strip with slot highlight, counts, and selected-item label
- First-person arm and held-block rendering tied to the selected hotbar slot
- `E`-opened inventory screen with clickable slot movement and a carried cursor stack

## Requirements

- Bun 1.1+
- Apple clang / Xcode command line tools
- GLFW installed locally, for example `brew install glfw`

## Commands

- `bun run build:native` builds `native/libvoxel_bridge.dylib`
- `bun run clean:data` removes `apps/client/dist` and `apps/dedicated-server/dist` for a fresh local state
- `bun run dev:client` builds the native bridge and starts the desktop client
- `bun run dev:client:clean` wipes only `apps/client/dist` and then starts the desktop client
- `bun run dev:server` starts the dedicated WebSocket server only
- `bun run dev:server:clean` wipes only `apps/dedicated-server/dist` and then starts the dedicated server
- `bun run dev:full` starts the dedicated server and the desktop client together
- `bun run dev:full:clean` wipes `apps/client/dist` and `apps/dedicated-server/dist` and then starts the full client-plus-server dev flow
- `bun run typecheck` runs TypeScript checks
- `bun test` runs the automated tests
- Launch options: `--player-name=<name>` or `--player-name <name>` overrides the local player name for that run
- Launch options: `--client-dir=<path>` or `--client-dir <path>` overrides the desktop app's client-local data root
- Launch options: `--server-dir=<path>` or `--server-dir <path>` overrides the dedicated server data root
- Example: `bun run dev:client -- --client-dir=./client-data`
  resolves to `apps/client/client-data`
- Example: `bun run dev:server -- --server-dir=./server-data`
  resolves to `apps/dedicated-server/server-data`
- Example: `bun run dev:full -- --client-dir=./client-data --server-dir=./server-data`
  resolves to `apps/client/client-data` and `apps/dedicated-server/server-data`
- `bun run dev:client` runs with `APP_ENV=development` and defaults a fresh local player profile to `Developer`

## Controls

### Menu

- Mouse moves the cursor
- Left click presses buttons
- `Esc` exits

### In Game

- `WASD` move
- Mouse look
- `Space` jump
- Double-tap `Space` toggles creative flight after `/gamemode 1`
- `Shift` descends while flying
- Left click break block
- Right click place the selected hotbar item if it places a block
- `1`-`9` select hotbar slots
- `E` opens and closes the inventory
- `Enter` opens chat
- Typing `/` opens command chat
- `/gamemode 0` switches to normal mode
- `/gamemode 1` switches to creative mode
- `Esc` exits

## Project Layout

- `apps/client` desktop app package with the app bootstrap, `GameApp`, client runtime, rendering, UI, input, singleplayer worker startup, and runtime assets under `apps/client/assets`
- `apps/dedicated-server` dedicated WebSocket server package with process startup and server lifecycle wiring
- `apps/cli` developer CLI workspace with native build, combined dev flow, data cleanup, and asset-generation scripts
- `packages/core` shared package published internally as `@craftvale/core`, with stable export surfaces at `@craftvale/core/shared` and `@craftvale/core/server`
- `packages/core/src/shared` typed message schemas, transport, event-bus plumbing, shared CLI parsing, and shared logging helpers
- `packages/core/src/server` authoritative world runtime, world-level entity state, player system, dropped item system, world-session control, and binary world storage
- `packages/core/src/world` chunks, biome/terrain generation, meshing, atlas metadata/UVs, inventory helpers, item/block registries, and raycasting
- `packages/core/src/math` shared math helpers
- `native` GLFW/OpenGL bridge in C
- `apps/client/assets/shaders` client GLSL shaders
- `apps/client/assets/textures` client runtime textures
- `plans` implementation plans for major feature work
- `tests` coverage for client/server flow, storage, terrain, meshing, raycast, player, highlight, text, and UI

## Commit Messages

- Use commit subjects in the form `<type>: <summary>`.
- Allowed commit types are `fix:`, `feat:`, `refactor:`, `test:`, and `docs:`.
- Keep the subject short and action-oriented, for example `feat: add player-name profiles`.
- Every commit should include a body that explains what changed and why.
- Commits created through Codex should include `Co-authored-by: Codex <codex@openai.com>`.

## Notes

- Local singleplayer worlds are created from the menu. A dedicated multiplayer server creates or loads exactly one world when it starts.
- In local singleplayer, world list/create/delete lives on the app side; the worker only boots for the selected world and runs gameplay for that one world.
- The repo is organized as Bun workspaces: `@craftvale/client`, `@craftvale/dedicated-server`, and `@craftvale/core`.
- Shared imports should prefer the package export surfaces `@craftvale/core/shared` and `@craftvale/core/server` instead of deep relative cross-workspace imports.
- Entering a world now follows a menu -> loading -> play flow instead of dropping straight into partially streamed terrain.
- Biomes, terrain, and trees are all derived deterministically from the world seed.
- World state is authoritative on the server side in both local worker mode and dedicated WebSocket mode.
- Local singleplayer reports real startup loading progress from the worker, while multiplayer uses a simpler loading screen until the first startup chunk set is ready.
- `AuthoritativeWorld` owns chunk/world authority while `PlayerSystem` mutates player components inside shared world-owned entity state.
- Broken collectible blocks resolve explicit dropped item ids, spawn dropped item actors in that same world-owned entity space, and players pick them up through a server-authoritative proximity check.
- The client inventory, dropped-item state, HUD, and held-item rendering are item-based even when a first-pass item still maps one-to-one to a placeable block.
- The client renders remote players as simple cube-based bodies and reuses that same cuboid visual language for the local first-person arm and held item.
- Dedicated servers expose one generated world only; clients do not browse remote world lists.
- Player identity is stored separately from world saves in `apps/client/dist/player-profile.json`.
- The default layout separates desktop-client data under `apps/client/dist` from dedicated-server data under `apps/dedicated-server/dist`.
- Local singleplayer world saves now live under `apps/client/dist/worlds`.
- `--client-dir` overrides the desktop app root, including local worlds under `<client-dir>/worlds`.
- `--server-dir` overrides the dedicated server root.
- Player gamemode persists per player/world; chat history is session-only in this first pass.
- The menu background is seeded and stable for a given run.
- The play HUD is built from lightweight rectangle/text overlays rather than a retained widget framework.
- The current implementation targets macOS first.

## Possible Future Work

- Shared non-player actor systems built on the world-level entity state
- Survival systems such as health, fall damage, death/respawn, hunger, and healing
- Crafting flows including player crafting and a crafting table
- Tool progression with mining tiers, faster harvesting, and block hardness
- Furnace and smelting mechanics with fuel and ore processing
- Cave generation plus underground resource progression such as coal, iron, gold, and diamond
- Day/night cycle and stronger atmosphere changes across time of day
- Hostile mobs to make nights and exploration feel more dangerous
- Water and lava simulation for terrain interaction and building
- Utility blocks such as chests, beds, torches, furnaces, and crafting tables
- Movement and building polish such as sprinting, sneaking, swimming, ladders, slabs, stairs, and doors
- Expanded biomes and world variety including rivers, oceans, beaches, deserts, snow regions, and larger forests
- Dynamic lighting for sunlight and torch-lit spaces
- Equipment systems including armor, durability, shields, and ranged combat
- Richer inventory UX such as chest UI, shift-click transfer, and advanced stack shortcuts
- Farming and food loops with crops, animals, cooking, and renewable resources

## Code Size Snapshot

Source-line snapshot as of 2026-03-25 using `wc -l` over TypeScript, C, and GLSL files. This excludes docs, JSON/package metadata, lockfiles, and binary assets.

- `apps/client/src`: 8,516 lines of TypeScript
- `apps/client/assets/shaders`: 78 lines of GLSL
- `apps/dedicated-server`: 376 lines of TypeScript
- `packages/core`: 5,676 lines of TypeScript
- `apps/cli/src`: 681 lines of TypeScript
- `native`: 429 lines of C
- `tests`: 3,447 lines of TypeScript
- Total source lines including tests: 19,203
- Total source lines excluding tests: 15,756
