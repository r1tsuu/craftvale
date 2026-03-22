# Minecraft Clone

A macOS-first Bun desktop voxel sandbox with a thin C bridge for GLFW windowing and OpenGL rendering. Bun/TypeScript handles the client/server runtime split, world generation, meshing, player/controller logic, persistence, menu UI, and HUD.

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
- Server-authoritative block breaking and placing through a worker-backed client/server architecture
- Per-world save/load with named worlds and binary chunk persistence
- Server-authoritative 9-slot hotbar inventory with starter stacks and HUD display
- Nine placeable hotbar block types including terrain, wood, and masonry-style blocks
- Create, join, delete, and save worlds from the menu
- Pre-game menu with reusable UI components and clickable buttons
- Seeded Minecraft-like menu background
- On-screen HUD text for FPS, position, rotation, world name, and status
- Bottom-center hotbar strip with slot highlight, counts, and selected-item label

## Requirements

- Bun 1.1+
- Apple clang / Xcode command line tools
- GLFW installed locally, for example `brew install glfw`

## Commands

- `bun run build:native` builds `native/libvoxel_bridge.dylib`
- `bun run dev` builds the native bridge and starts the app
- `bun run typecheck` runs TypeScript checks
- `bun test` runs the automated tests

## Controls

### Menu

- Mouse moves the cursor
- Left click presses buttons
- `Esc` exits

### In Game

- `WASD` move
- Mouse look
- `Space` jump
- Left click break block
- Right click place the selected hotbar block
- `1`-`9` select hotbar slots
- `Esc` exits

## Project Layout

- `src/client` client runtime and worker client adapter
- `src/server` authoritative world runtime and binary world storage
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

## Notes

- World generation starts after a world is created or joined.
- Biomes, terrain, and trees are all derived deterministically from the world seed.
- World state is worker/server-authoritative even in the current single-player setup.
- The menu background is seeded and stable for a given run.
- The play HUD is built from lightweight rectangle/text overlays rather than a retained widget framework.
- The current implementation targets macOS first.
