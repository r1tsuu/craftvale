# Bun + GLFW + OpenGL Voxel Sandbox Plan

## Summary

Build a macOS-first desktop Bun application for a simple Minecraft-like voxel sandbox using a thin native C bridge for GLFW window creation and OpenGL access. Bun remains the app/runtime layer for game logic, world simulation, asset/config loading, and orchestration; the C layer only owns the platform and graphics boundary.

The first milestone is a walkable sandbox: open a window, initialize OpenGL, render chunked voxel terrain, move a first-person camera, and place/remove blocks. Networking, advanced lighting, multiplayer, and full survival systems stay out of scope.

## Key Implementation Changes

### Project structure

- Create a Bun app with three main areas:
  - `src/` for TypeScript game code
  - `native/` for the C bridge and build artifacts
  - `assets/` for shaders and simple block definitions
- Add Bun scripts for:
  - building the native bridge
  - running the app in dev mode
  - validating TypeScript and running tests
- Use a generated dynamic library from `native/` that Bun loads through FFI at startup.

### Native bridge

- Implement a small C API that wraps only the functions Bun needs:
  - window creation/destruction
  - OpenGL context creation and buffer swapping
  - input polling
  - viewport resize callback forwarding
  - time query
  - a minimal GL command surface needed for shader/program setup, buffers, textures, uniforms, and draw calls
- Keep raw GLFW/OpenGL handles opaque on the Bun side; expose them as pointers/integers only where required by FFI.
- Prefer a pull-based frame API:
  - `init_window(config)`
  - `poll_events()`
  - `window_should_close()`
  - `begin_frame()`
  - `end_frame()`
  - input getters for keyboard/mouse state
- Compile against system GLFW on macOS and use the platform OpenGL framework for v1.

### Bun/TypeScript engine layer

- Organize the TS side into these subsystems:
  - `platform`: FFI loading, native symbol definitions, lifecycle boot
  - `render`: shader loading, GL resource wrappers, chunk mesh upload, camera matrices
  - `world`: block registry, chunk storage, chunk generation, dirty-chunk rebuild queue
  - `game`: player controller, raycast interaction, tick/update loop
- Use a fixed simulation tick plus interpolated render loop:
  - simulation at a stable rate for input/player/world updates
  - rendering every frame using current camera state
- Represent voxel data as chunked 3D arrays, with a fixed chunk size chosen once and used everywhere. Default: `16 x 16 x 16`.
- Start with a small block set:
  - air
  - grass
  - dirt
  - stone
- Generate simple terrain from height-based noise or deterministic layered terrain. Default: deterministic layered terrain with optional noise added later.
- Rebuild chunk meshes only when a chunk becomes dirty from generation or block edits.
- Use face-culling mesh generation:
  - emit faces only when neighboring voxels are empty or transparent
  - no greedy meshing in v1
- Use a texture atlas only if it simplifies shader inputs; otherwise begin with per-face UV constants and one atlas texture.

### Rendering approach

- Use OpenGL core-style rendering with:
  - one shader program for opaque voxel geometry
  - VBO/VAO/EBO-backed chunk meshes
  - depth testing and back-face culling enabled
- Start with unlit color/texture rendering plus simple directional shading based on face normal; do not add shadow maps, SSAO, or deferred rendering in v1.
- Maintain a world-to-chunk coordinate helper layer so block edits, raycasts, and mesh rebuilds use the same conversion logic.
- Implement frustum-aware chunk submission only if cheap; otherwise use a bounded active world radius first. Default: bounded visible radius around the player.

### Public interfaces and types

- Native bridge should expose a compact, stable ABI rather than mirroring GLFW/OpenGL wholesale.
- TypeScript should define these core interfaces:
  - `WindowConfig`
  - `InputState`
  - `BlockId`
  - `ChunkCoord`
  - `Chunk`
  - `MeshData`
  - `PlayerState`
- Keep block registry data-driven enough to add more block types without changing meshing logic.
- Shader/uniform APIs on the TS side should be renderer-local, not global engine abstractions.

## Test Plan

- Native bridge smoke test:
  - library builds successfully
  - Bun can load symbols through FFI
  - window/context creation succeeds on macOS
- Render boot test:
  - clear screen presents correctly
  - viewport updates on resize
  - shader compile/link errors are surfaced clearly
- World tests:
  - chunk indexing and world/block coordinate conversion
  - neighbor lookup across chunk boundaries
  - dirty-chunk marking after block edits
- Meshing tests:
  - fully enclosed voxels emit no faces
  - exposed voxels emit correct face counts
  - boundary voxels mesh correctly when adjacent chunk data exists or is missing
- Gameplay tests:
  - WASD + mouse-look camera movement updates as expected
  - raycast selects the correct target block
  - place/remove modifies world state and schedules mesh rebuilds
- Performance acceptance for v1:
  - stable interaction with a small active chunk radius
  - no full-world remesh on single-block edits

## Assumptions And Defaults

- Target platform is macOS first; Linux/Windows support is deferred until after the bridge API is stable.
- Bun talks to native code through a thin C bridge, not direct raw bindings to all GLFW/OpenGL symbols.
- First milestone is a walkable voxel sandbox, not just a renderer demo and not a fuller survival game.
- Save/load, audio, UI menus, multiplayer, liquids, mobs, greedy meshing, and advanced lighting are out of scope for v1.
- If cross-platform support is added later, the existing bridge boundary becomes the portability seam rather than rewriting the Bun game layer.
