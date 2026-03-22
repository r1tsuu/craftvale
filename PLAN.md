# Minecraft Clone Status

## Summary

The original Bun + GLFW + OpenGL voxel sandbox plan has been implemented as a playable macOS-first prototype. The app now starts in a menu, generates the world only after starting a game, renders chunked voxel terrain, supports first-person interaction, and includes a small reusable UI system for future menu expansion.

## Implemented

- Bun app structure with `src/`, `native/`, `assets/`, `scripts/`, and `tests/`
- Thin native C bridge for:
  - GLFW window/context lifecycle
  - event polling and cursor/key/mouse input
  - framebuffer and window size queries
  - OpenGL calls needed for shaders, buffers, uniforms, and draw calls
- Voxel world systems:
  - chunked block storage
  - deterministic terrain generation
  - dirty-chunk rebuild behavior
  - face-culling mesh generation
  - block add/remove interactions
  - raycast targeting
- Rendering systems:
  - opaque voxel terrain rendering
  - focused block highlight
  - bitmap HUD text rendering
  - 2D rectangle rendering for UI
- Gameplay systems:
  - first-person mouse look
  - grounded FPS movement
  - jump and gravity
  - simple voxel collision
- UI systems:
  - reusable component model for panels, labels, and buttons
  - clickable start/quit main menu
  - seeded Minecraft-like menu background

## Current Behavior

- Window title is `Minecraft Clone`
- App starts in a menu with `START GAME` and `QUIT`
- World generation is deferred until `START GAME`
- In-game HUD shows:
  - FPS
  - player position
  - player rotation
- Current block set:
  - air
  - grass
  - dirt
  - stone

## Validation

- `bun run build:native` builds the bridge dylib
- `bun run typecheck` passes
- `bun test` passes
- Automated tests currently cover:
  - world coordinate and chunk behavior
  - mesh generation
  - raycasting
  - player gravity/jump/collision
  - text mesh generation
  - highlight mesh generation
  - UI button evaluation

## Remaining Gaps Vs. Long-Term Vision

- No save/load
- No audio
- No inventory or survival systems
- No greedy meshing
- No textures/atlas yet; blocks are color shaded
- No multiplayer
- No cross-platform support beyond the macOS-first setup
