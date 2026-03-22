# Minecraft Clone

A macOS-first Bun desktop voxel sandbox using a thin C bridge for GLFW windowing and OpenGL rendering. Bun/TypeScript handles the world, meshing, player/controller logic, menu UI, and HUD.

## Current Features

- GLFW window creation and OpenGL 3.3 core rendering through a Bun FFI bridge
- Chunked voxel terrain with face-culling meshing
- First-person camera with grounded FPS movement
- Jump, gravity, and voxel collision
- Block breaking and placing
- Focused block highlight
- Pre-game menu with reusable UI components and clickable buttons
- Seeded Minecraft-like menu background
- On-screen HUD text for FPS, position, and rotation

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
- Right click place stone block
- `Esc` exits

## Project Layout

- `src/platform` native bridge loading and GL bindings
- `src/render` voxel rendering, text, UI rectangles, and highlight rendering
- `src/world` chunks, terrain generation, meshing, and raycasting
- `src/game` player movement and physics
- `src/ui` menu layout, UI components, and UI rendering
- `native` GLFW/OpenGL bridge in C
- `assets/shaders` GLSL shaders
- `tests` world, meshing, raycast, player, highlight, text, and UI tests

## Notes

- World generation starts only after `START GAME` is pressed.
- The menu background is seeded and stable for a given run.
- The current implementation targets macOS first.
