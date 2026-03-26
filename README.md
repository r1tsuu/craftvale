# Craftvale

A macOS-first Bun desktop voxel sandbox. A thin C bridge handles GLFW windowing and OpenGL rendering; Bun workspaces split the desktop client, dedicated server, and shared gameplay/runtime code into explicit packages.

## Quick Start

```sh
# Install dependencies
bun install

# Install GLFW (macOS)
brew install glfw

# Build the native bridge and launch the client
bun run dev:client
```

Use `bun run dev:full` to start a dedicated WebSocket server alongside the client.

## Requirements

- Bun 1.1+
- Apple clang / Xcode command line tools
- GLFW: `brew install glfw`

## Design Principles

- Keep gameplay authoritative on the server in both local worker and dedicated WebSocket modes.
- Prefer deterministic systems so worlds, terrain, lighting inputs, and content generation remain stable from the world seed and authored specs.
- Keep one canonical source for important game data such as content definitions, inventory state, and item visuals.
- Reuse the same visual language across the world, the hand, dropped items, and the HUD instead of maintaining parallel asset pipelines.
- Favor explicit, typed boundaries between client, server, tooling, and shared core code.

## Commands

### Development

| Command | Description |
|---|---|
| `bun run dev:client` | Build native bridge and start the desktop client |
| `bun run dev:client:clean` | Wipe client dist, then start the client |
| `bun run dev:server` | Start the dedicated WebSocket server only |
| `bun run dev:server:clean` | Wipe server dist, then start the server |
| `bun run dev:full` | Start the dedicated server and client together |
| `bun run dev:full:clean` | Wipe all dist, then start server + client |

### Build

| Command | Description |
|---|---|
| `bun run build:native` | Build `native/libvoxel_bridge.dylib` |
| `bun run clean:data` | Remove `apps/client/dist` and `apps/dedicated-server/dist` |

### Asset Generation

| Command | Description |
|---|---|
| `bun run generate:content` | Regenerate block/item ids and registries from the content spec |
| `bun run generate:tile-sources` | Write one PNG per voxel tile into `apps/client/assets/textures/tiles-src` |
| `bun run generate:atlas` | Rebuild `apps/client/assets/textures/voxel-atlas.png` from tile PNGs |

### Code Quality

| Command | Description |
|---|---|
| `bun run lint` | Run ESLint across the repo |
| `bun run lint:fix` | Run ESLint and apply safe auto-fixes |
| `bun run format` | Run Prettier across supported files |
| `bun run format:check` | Check formatting without rewriting files |
| `bun run typecheck` | Run TypeScript checks |
| `bun test` | Run automated tests |

### Launch Options

Pass these after `--` when using any `dev:*` command:

| Flag | Description |
|---|---|
| `--player-name=<name>` | Override the local player name for this run |
| `--client-dir=<path>` | Override the desktop app's client-local data root (relative to `apps/client`) |
| `--server-dir=<path>` | Override the dedicated server data root (relative to `apps/dedicated-server`) |

```sh
# Examples
bun run dev:client -- --client-dir=./client-data
bun run dev:server -- --server-dir=./server-data
bun run dev:full  -- --client-dir=./client-data --server-dir=./server-data
```

`bun run dev:client` runs with `APP_ENV=development` and defaults a fresh local player profile to `Developer`.

## Controls

### Menu

| Input | Action |
|---|---|
| Mouse | Move cursor |
| Left click | Press button |
| `Esc` | Exit |

### In Game

| Input | Action |
|---|---|
| `WASD` | Move |
| Mouse | Look |
| `Space` | Jump |
| Double-tap `Space` | Toggle creative flight (requires `/gamemode 1`) |
| `Shift` | Descend while flying |
| Left click | Break block |
| Right click | Place selected hotbar item |
| `1`–`9` | Select hotbar slot |
| `E` | Open / close inventory |
| `Enter` | Open chat |
| `/` | Open command chat |
| `Esc` | Exit / pause |

### In-Game Commands

| Command | Effect |
|---|---|
| `/gamemode 0` | Switch to normal mode |
| `/gamemode 1` | Switch to creative mode |
| `/save` | Immediate world save |
| `/seed` | Print world seed to chat |
| `/teleport <x> <y> <z>` | Move to coordinates |
| `/timeset day\|night\|<tick>` | Change world time |

The authoritative server autosaves periodically; successful autosaves are printed to chat.

## Current Functionality

### World and Rendering

- GLFW window creation and OpenGL 3.3 core rendering through the Bun FFI bridge
- Textured voxel terrain with a generated atlas, directional face shading, and separate opaque/cutout passes
- Deterministic biome-aware terrain generation across a 256-block-tall world with sea level at Y 64
- Deterministic cave systems with enclosed underground pockets plus hillside and surface-adjacent openings
- Config-driven ore generation for coal, iron, gold, and diamond with depth-based distribution
- Full-height `16x256x16` chunk columns keyed by `(x, z)` with horizontal area-based loading
- Deterministic tree placement that stays chunk-order safe across borders
- Dynamic focused-block highlight, first-person arm rendering, and block-backed held-item rendering
- Dropped items rendered as cube-based world actors; HUD inventory items rendered from the same shared block-item visual source

### Gameplay and Authority

- First-person movement with grounded collision, jump physics, and creative flight toggled by double-tapping `Space`
- Server-authoritative block breaking, placing, inventory mutation, dropped-item spawning, and pickups
- Authoritative fixed-step world tick loop for both local worker and dedicated server modes
- Periodic server-side autosave on the authoritative tick loop, plus manual `/save` while in-game
- Per-player position, rotation, gamemode, and inventory persistence inside each world

### Multiplayer and World Flow

- Local singleplayer backed by an in-process worker-hosted authoritative server
- Dedicated multiplayer over WebSocket with one authoritative shared world per server
- Saved server browser with a built-in localhost entry plus add/delete/join flow
- Explicit loading screen and startup chunk pregeneration before entering play
- Create, join, save, and delete worlds from the menu

### UI and UX

- Seeded Minecraft-like menu background and reusable menu UI components
- Bottom-center hotbar, `E` inventory screen, cursor stack interactions, and selected-item labeling
- In-game chat, slash command entry, passive chat feed, and pause/settings overlays
- Debug overlay with FPS, TPS, lighting information, and source labeling for worker vs WebSocket sessions
- World clock display with AM/PM formatting
- Stable local player identity with optional `--player-name` override

## Project Layout

```
apps/
  client/             Desktop app — bootstrap, GameApp, client runtime, rendering, UI, input
    assets/
      shaders/        GLSL shaders
      textures/
        tiles-src/    Editable per-tile PNG source textures
        voxel-atlas.png
  dedicated-server/   Dedicated WebSocket server — process startup and server lifecycle
  cli/                Developer CLI — native build, dev flow, data cleanup, asset generation
    src/
      generate-content-registry.ts
      generate-voxel-atlas.ts
      generate-voxel-tile-sources.ts
packages/
  core/               @craftvale/core — shared exports at /shared and /server surfaces
    src/
      shared/         Message schemas, transport, event-bus, CLI parsing, logging
      server/         Authoritative world runtime, player system, dropped items, binary storage
      world/          Chunks, terrain/biome generation, meshing, atlas UVs, content spec,
                      generated registries, inventory helpers, raycasting
      math/           Shared math helpers
native/               GLFW/OpenGL C bridge
plans/                Implementation plans for major feature work
tests/                Coverage for client/server flow, storage, terrain, meshing, and UI
```

Content authoring and the asset pipeline are documented in [`architecture.md`](./architecture.md).

## Commit Messages

- Use subjects in the form `<type>: <summary>`.
- Allowed types: `fix:`, `feat:`, `refactor:`, `test:`, `docs:`, `chore:`, `build:`, `format:`.
- Keep subjects short and action-oriented, e.g. `feat: add player-name profiles`.
- Every commit should include a body that explains what changed and why.
- Commits created through Codex: `Co-authored-by: Codex <codex@openai.com>`
- Commits created through Claude Code: `Co-authored-by: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Editor Setup

- `.vscode/settings.json` enables format-on-save with Prettier and ESLint fixes.
- Recommended extensions are listed in `.vscode/extensions.json`.

## Possible Future Work

- Survival systems: health, fall damage, death/respawn, hunger, and healing
- Crafting flows: player crafting and a crafting table
- Tool progression with mining tiers, faster harvesting, and block hardness
- Furnace and smelting mechanics with fuel and ore processing
- Day/night cycle and stronger atmosphere changes across time of day
- Hostile mobs to make nights and exploration feel more dangerous
- Water and lava simulation for terrain interaction and building
- Utility blocks: chests, beds, torches, furnaces, and crafting tables
- Movement and building polish: sprinting, sneaking, swimming, ladders, slabs, stairs, and doors
- Expanded biomes: rivers, oceans, beaches, deserts, snow regions, and larger forests
- Dynamic lighting for sunlight and torch-lit spaces
- Equipment systems: armor, durability, shields, and ranged combat
- Richer inventory UX: chest UI, shift-click transfer, and advanced stack shortcuts
- Farming and food loops with crops, animals, cooking, and renewable resources
- Shared non-player actor systems built on the world-level entity state

## Code Size Snapshot

Source-line snapshot as of 2026-03-26 using `wc -l` over TypeScript, C, and shader files. Excludes docs, JSON/package metadata, lockfiles, and binary assets.

| Package | Lines |
|---|---|
| `apps/client/src` | 8,782 TS |
| `apps/client/assets/shaders` | 118 GLSL |
| `apps/dedicated-server` | 343 TS |
| `packages/core` | 8,548 TS |
| `apps/cli/src` | 1,160 TS |
| `native` | 459 C |
| `tests` | 5,029 TS |
| **Total (with tests)** | **24,439** |
| **Total (without tests)** | **19,410** |
