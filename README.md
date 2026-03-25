# Minecraft Clone

A macOS-first Bun desktop voxel sandbox with a thin C bridge for GLFW windowing and OpenGL rendering. Bun/TypeScript handles the client/server runtime split, world generation, meshing, player/controller logic, persistence, menu UI, HUD, and both local and WebSocket-backed multiplayer transport.

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
- World-level server entity state with shared entity ids for authoritative actors
- Dedicated `PlayerSystem` operating within that shared world entity state
- Server-authoritative dropped item entities with floor spawning, pickups, and persistence
- In-game chat with slash-command submission and system feedback
- Server-authoritative `/gamemode 0` and `/gamemode 1` command handling
- Creative-mode flight toggled by double-tapping `Space`
- Per-world save/load with named worlds and binary chunk persistence
- Server-authoritative full inventory with a 9-slot hotbar, main storage grid, stack movement, and per-player persistence
- Nine placeable hotbar block types including terrain, wood, and masonry-style blocks
- Create, join, delete, and save worlds from the menu
- Multiplayer server browser with saved servers, add/delete controls, and direct join flow
- Explicit world loading screen for local singleplayer and multiplayer joins
- Server-authoritative startup chunk pregeneration around the initial entry area
- Pre-game menu with reusable UI components and clickable buttons
- Seeded Minecraft-like menu background
- On-screen HUD text for FPS, position, rotation, world name, and status
- Bottom-center hotbar strip with slot highlight, counts, and selected-item label
- `E`-opened inventory screen with clickable slot movement and a carried cursor stack

## Requirements

- Bun 1.1+
- Apple clang / Xcode command line tools
- GLFW installed locally, for example `brew install glfw`

## Commands

- `bun run build:native` builds `native/libvoxel_bridge.dylib`
- `bun run clean:data` removes the repo `data/` directory for a fresh local state
- `bun run dev` builds the native bridge and starts the app
- `bun run dev:clean` wipes `data/` and then starts the app
- `bun run dev:server` starts the dedicated WebSocket server only
- `bun run dev:full` starts the dedicated server and the desktop client together, and prefills the saved server list with the local server
- `bun run dev:full:clean` wipes `data/` and then starts the full client-plus-server dev flow
- `bun run typecheck` runs TypeScript checks
- `bun test` runs the automated tests
- Launch options: `--player-name=<name>` or `--player-name <name>` overrides the local player name for that run
- `bun run dev` runs with `APP_ENV=development` and defaults a fresh local player profile to `Developer`

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
- Right click place the selected hotbar block
- `1`-`9` select hotbar slots
- `E` opens and closes the inventory
- `Enter` opens chat
- Typing `/` opens command chat
- `/gamemode 0` switches to normal mode
- `/gamemode 1` switches to creative mode
- `Esc` exits

## Project Layout

- `src/client` client runtime, local-world metadata/storage helpers, worker client adapter, WebSocket client adapter, and saved-server persistence
- `src/server` authoritative world runtime, world-level entity state, player system, dropped item system, dedicated WebSocket server, and binary world storage
- `src/shared` typed message schemas, transport, and event-bus plumbing
- `src/platform` native bridge loading and GL bindings
- `src/render` voxel rendering, text, UI rectangles, and highlight rendering
- `src/world` chunks, biome/terrain generation, meshing, atlas data, inventory helpers, and raycasting
- `src/game` player movement and physics
- `src/ui` menu layout, HUD composition, UI components, and UI rendering
- `native` GLFW/OpenGL bridge in C
- `assets/shaders` GLSL shaders
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
- Entering a world now follows a menu -> loading -> play flow instead of dropping straight into partially streamed terrain.
- Biomes, terrain, and trees are all derived deterministically from the world seed.
- World state is authoritative on the server side in both local worker mode and dedicated WebSocket mode.
- Local singleplayer reports real startup loading progress from the worker, while multiplayer uses a simpler loading screen until the first startup chunk set is ready.
- `AuthoritativeWorld` owns chunk/world authority while `PlayerSystem` mutates player components inside shared world-owned entity state.
- Broken collectible blocks spawn dropped item actors in that same world-owned entity space, and players pick them up through a server-authoritative proximity check.
- Dedicated servers expose one generated world only; clients do not browse remote world lists.
- Player identity is stored separately from world saves in `data/client/player-profile.json`.
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
