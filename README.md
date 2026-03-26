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
- Server-authoritative inventory with one canonical slot list, derived hotbar/main UI layout, stack movement, and per-player persistence
- Separate item and block registries, with explicit item-to-block placement and block-to-item drop mappings
- Generated content registries with authored string keys, checked-in id locks, and stable numeric block/item ids
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
- `bun run generate:content` regenerates block/item ids and registries from the authored content spec
- `bun run generate:tile-sources` writes one PNG per voxel tile into `apps/client/assets/textures/tiles-src`
- `bun run generate:atlas` rebuilds `apps/client/assets/textures/voxel-atlas.png` from those source tile PNGs
- `bun run lint` runs ESLint across the repo
- `bun run lint:fix` runs ESLint and applies safe auto-fixes
- `bun run format` runs Prettier across supported files in the repo
- `bun run format:check` checks formatting without rewriting files
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
- `apps/client/assets/textures/tiles-src` editable per-tile PNG source textures
- `apps/dedicated-server` dedicated WebSocket server package with process startup and server lifecycle wiring
- `apps/cli` developer CLI workspace with native build, combined dev flow, data cleanup, and asset-generation scripts
- `apps/cli/src/generate-voxel-tile-sources.ts` writes default per-tile source PNGs
- `apps/cli/src/generate-content-registry.ts` deterministic content-registry generation for block/item ids and registries
- `apps/cli/src/generate-voxel-atlas.ts` packs source tile PNGs into the runtime atlas
- `packages/core` shared package published internally as `@craftvale/core`, with stable export surfaces at `@craftvale/core/shared` and `@craftvale/core/server`
- `packages/core/src/shared` typed message schemas, transport, event-bus plumbing, shared CLI parsing, and shared logging helpers
- `packages/core/src/server` authoritative world runtime, world-level entity state, player system, dropped item system, world-session control, and binary world storage
- `packages/core/src/world` chunks, biome/terrain generation, meshing, atlas metadata/UVs, authored content specs, generated item/block registries, inventory helpers, and raycasting
- `packages/core/src/math` shared math helpers
- `native` GLFW/OpenGL bridge in C
- `apps/client/assets/shaders` client GLSL shaders
- `apps/client/assets/textures` client runtime textures
- `plans` implementation plans for major feature work
- `tests` coverage for client/server flow, storage, terrain, meshing, raycast, player, highlight, text, and UI

## Adding Content

Craftvale no longer hand-authors numeric block and item ids. New content starts from one authored source and then goes through the content generator.

### Source Of Truth

- Author blocks and items in `packages/core/src/world/content-spec.ts`.
- Treat `packages/core/src/world/content-id-lock.json` as the stable id snapshot that preserves save and protocol compatibility.
- Treat `packages/core/src/world/generated/content-ids.ts` and `packages/core/src/world/generated/content-registry.ts` as generated outputs only. Do not edit them by hand.

### Add A New Placeable Block-Backed Item

1. Add a block entry to `AUTHORED_BLOCK_SPECS`.
   Use a new stable `key`, set collision/render/light metadata, and set `dropItemKey` to the item key you want from breaking the block.
2. Add an item entry to `AUTHORED_ITEM_SPECS`.
   Point `placesBlockKey` and usually `renderBlockKey` at the block key so the item can place and visually represent that block.
3. If the block uses textures, set `tiles.top`, `tiles.bottom`, and `tiles.side`.
   These tile names must already exist in `AtlasTiles`; if they do not, add the atlas tile first.
4. If you want the item in the default inventory, update:
   `DEFAULT_HOTBAR_ITEM_KEYS` for a starter hotbar slot.
   `DEFAULT_MAIN_INVENTORY_STACK_SPECS` for starter main inventory stacks.
5. Run `bun run generate:content`.
6. If the block needs new art, add or edit the matching tile PNGs in `apps/client/assets/textures/tiles-src/`.
7. Run `bun run generate:atlas`.
8. Run `bun run typecheck` and `bun test`.

### Add A Block Without A Player Item

- Add a block entry in `AUTHORED_BLOCK_SPECS`.
- Set `dropItemKey` to `null` if breaking it should not create an item drop.
- Omit any matching item entry unless players need to hold, place, or pick up it.

`bedrock` is the current example of a block-only entry.

### Add An Item Without A Placeable Block

- Add an item entry in `AUTHORED_ITEM_SPECS`.
- Set `placesBlockKey` to `null`.
- Set `renderBlockKey` to `null` unless you want the item rendered using an existing block mesh.

This is the path for future tools, consumables, and ingredients.

### Field Guide

- `key`: Stable authoring identity. Keep it short, lowercase, and durable because saves and generated ids are tied to it.
- `name`: Player-facing display name source.
- `color`: Used in fallback/debug-style item display paths.
- `dropItemKey`: Item dropped when the block is broken.
- `placesBlockKey`: Block the item places, if any.
- `renderBlockKey`: Block mesh used to render the held item, dropped item, and live HUD inventory item, if any.
- `renderPass`: Use `"opaque"` for solid terrain, `"cutout"` for alpha-discard blocks like leaves, or `null` for non-rendered blocks such as air.
- `occlusion`: Use `"full"` for normal solid cubes, `"self"` for leaf-style self-culling, or `"none"` for non-occluding blocks.
- `emittedLightLevel`: Block light emitted by the block, from `0` to `15`.

### Adding Or Editing Tile Textures

- Edit per-tile source PNGs in `apps/client/assets/textures/tiles-src/`.
- Use one `16x16` RGBA PNG per tile id, for example `dirt.png` or `grass-top.png`.
- Keep tile ids aligned with `AtlasTiles` and the tile names referenced from `content-spec.ts`.
- After changing any source tile PNG, run `bun run generate:atlas`.
- Do not hand-edit `apps/client/assets/textures/voxel-atlas.png`; it is generated output.
- `bun run generate:tile-sources` exists to regenerate the current default source tile PNG set from code, but normal art iteration should happen by editing the PNGs in `tiles-src` directly.

### Id Stability Rules

- Do not hand-pick numeric ids for new content. The generator assigns them.
- Do not reorder generated files by hand. The generator and lockfile own the final ids.
- Adding a new key appends a new id automatically while preserving existing ids.
- Renaming or removing keys is a compatibility-sensitive change because existing saves may still reference the old ids.
- If you intentionally rename or remove content, update `content-spec.ts` and `content-id-lock.json` together in the same change and treat it as a migration or save reset decision.

### Typical Example

To add a new glowing placeable block:

1. Add a block spec such as `blue_lantern` with tiles, light level, and `dropItemKey: "blue_lantern"`.
2. Add a matching item spec with `placesBlockKey: "blue_lantern"` and `renderBlockKey: "blue_lantern"`.
3. Optionally add `"blue_lantern"` to `DEFAULT_HOTBAR_ITEM_KEYS`.
4. Run `bun run generate:content`.
5. Review the generated diff in `content-id-lock.json` and `generated/*`.

## Commit Messages

- Use commit subjects in the form `<type>: <summary>`.
- Allowed commit types are `fix:`, `feat:`, `refactor:`, `test:`, and `docs:`.
- Keep the subject short and action-oriented, for example `feat: add player-name profiles`.
- Every commit should include a body that explains what changed and why.
- Commits created through Codex should include `Co-authored-by: Codex <codex@openai.com>`.

## Editor Setup

- The repo includes `.vscode/settings.json` with format-on-save enabled.
- VSCode defaults to Prettier for formatting and applies ESLint fixes on save.
- The recommended extensions live in `.vscode/extensions.json`.

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
- Block/item content is authored in `packages/core/src/world/content-spec.ts`, with stable numeric ids tracked in `packages/core/src/world/content-id-lock.json` and generated outputs under `packages/core/src/world/generated`.
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

Source-line snapshot as of 2026-03-25 using `wc -l` over TypeScript, C, and shader files. This excludes docs, JSON/package metadata, lockfiles, and binary assets.

- `apps/client/src`: 9,310 lines of TypeScript
- `apps/client/assets/shaders`: 90 lines of GLSL
- `apps/dedicated-server`: 338 lines of TypeScript
- `packages/core`: 6,953 lines of TypeScript
- `apps/cli/src`: 723 lines of TypeScript
- `native`: 459 lines of C
- `tests`: 3,999 lines of TypeScript
- Total source lines including tests: 21,872
- Total source lines excluding tests: 17,873
