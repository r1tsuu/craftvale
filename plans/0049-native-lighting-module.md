# Native Lighting Module

## Status

Implemented.

This plan now documents the architecture that actually shipped, rather than the
earlier migration proposal.

## Summary

Authoritative chunk lighting now runs through a dedicated native C module,
separate from the GLFW/OpenGL bridge and separate from client-only code.

The current design is:

- `native/libvoxel_bridge.dylib`
  - GLFW windowing and OpenGL bridge only
- `native/liblighting.dylib`
  - native lighting compute only
- `packages/core/src/server/native-lighting.ts`
  - Bun FFI wrapper owned by shared/server code
- `packages/core/src/server/lighting-system.ts`
  - orchestration, world-time state, dirty-chunk selection, and chunk-to-native
    marshalling

There is no TypeScript lighting fallback path anymore. The old TypeScript
propagation implementation has been removed.

## Goals That Landed

- Move lighting propagation out of the server-side TypeScript hot path.
- Keep lighting native code independent from:
  - GLFW
  - OpenGL
  - desktop window/input lifecycle
  - client-only runtime concerns
- Preserve authoritative ownership in shared/server code:
  - `LightingSystem` still decides when lighting work runs
  - runtime/world code still decides which chunks are dirty
  - the native module only performs buffer-based lighting computation
- Keep the ABI mechanical and buffer-oriented for Bun FFI.
- Make the same native module usable by:
  - the local worker-backed authoritative server
  - the dedicated server
  - tests

## Final Architecture

### Native module split

The lighting code is now built as a second native target alongside the GLFW
bridge:

- [build-native.ts](/Users/sasha/craftvale/apps/cli/src/build-native.ts)
  builds:
  - `native/libvoxel_bridge.dylib`
  - `native/liblighting.dylib`

The lighting module is implemented in C and currently split into:

- [lighting_relight.c](/Users/sasha/craftvale/native/lighting_relight.c)
  - owns `lighting_relight_chunk`
- [lighting_borders.c](/Users/sasha/craftvale/native/lighting_borders.c)
  - owns external-border seeding and border-pair propagation
- [lighting_shared.h](/Users/sasha/craftvale/native/lighting_shared.h)
  - shared queue, indexing, and propagation helpers

This split is intentional. During the native-only rewrite, putting relight and
border entrypoints into one translation unit caused a measurable relight
regression from different clang optimization/codegen behavior. Splitting the
relight hot path back into its own translation unit recovered the lost
performance.

### Shared/server ownership

[lighting-system.ts](/Users/sasha/craftvale/packages/core/src/server/lighting-system.ts)
still owns:

- world-time state
- choosing dirty chunks
- collecting affected loaded neighbors
- building temporary native input buffers
- loading external neighbor data for border seeding
- applying native results back to chunk state

The native module owns only the lighting math and temporary native queue
processing.

### FFI wrapper

[native-lighting.ts](/Users/sasha/craftvale/packages/core/src/server/native-lighting.ts)
loads the native library and exposes a narrow backend with three operations:

- `relightChunk`
- `seedExternalBorderLight`
- `propagateBorderPair`

Inputs are plain typed arrays and primitive metadata. There is no callback-heavy
boundary and no native-side world ownership.

## Migration Outcome

The original migration ended up with a few important decisions:

- Rust was explored, but the shipped implementation is C.
- TypeScript parity comparison was useful during migration, but the TypeScript
  lighting backend has now been removed entirely.
- The dedicated benchmark command moved from a one-off lighting script to the
  generic benchmark runner under `apps/cli/src/benchmarks/`.

Current benchmark entrypoints:

- `bun run benchmark`
  - runs all registered benchmarks
- `bun run benchmark -- lighting`
  - runs the native lighting benchmark only

## Performance Notes

Before the TypeScript implementation was removed, the native relight path was
benchmarked against the old TypeScript backend and showed roughly a `10x` speedup
on the checked-in chunk fixture benchmark.

After moving all remaining lighting math into native code, a regression appeared
in the relight benchmark even though the algorithm was still effectively the same.
Investigation showed that the regression came from compiling relight and border
entrypoints together in one C translation unit, not from `LightingSystem` or the
benchmark harness.

The fix was to split:

- relight hot path into [lighting_relight.c](/Users/sasha/craftvale/native/lighting_relight.c)
- border operations into [lighting_borders.c](/Users/sasha/craftvale/native/lighting_borders.c)

With that split in place, `bun run benchmark -- lighting` recovered to about:

- `3.99 ms` mean over the 16-chunk benchmark fixture
- about `0.249 ms/chunk`

That is better than the earlier monolithic C build and close to the best
relight-only native measurements from the investigation.

## Non-Goals

Still out of scope for this plan:

- moving world generation into native code
- moving meshing or rendering into the lighting module
- merging lighting into the GLFW bridge
- adding multithreaded lighting jobs
- adding platform-specific SIMD tuning
- reintroducing a TypeScript fallback path

## Risks and Lessons

### Keep lighting separate from desktop bridge code

Mixing authoritative lighting compute into the GLFW/OpenGL bridge would make the
server/runtime boundary worse and couple dedicated-server concerns to client-only
platform code.

Current mitigation:

- lighting stays in its own native library
- shared/server code owns the wrapper and orchestration

### Translation-unit layout matters for native hot paths

The native-only rewrite showed that even with the same algorithm, C code
organization can change optimizer behavior enough to produce a real regression.

Current mitigation:

- relight stays isolated in its own translation unit
- border-oriented entrypoints stay separate
- benchmark tooling remains available to catch regressions early

### Native complexity must keep paying for itself

Adding a second native artifact is worthwhile only if the hot path keeps a clear
performance win and the surrounding ownership model stays simple.

Current mitigation:

- the ABI stays narrow and buffer-based
- `apps/cli` owns the build flow
- `packages/core/src/server` owns runtime integration

## Deliverables Shipped

- dedicated native lighting module under `native/`
- separate `liblighting.dylib` build target
- shared/server FFI wrapper in
  [native-lighting.ts](/Users/sasha/craftvale/packages/core/src/server/native-lighting.ts)
- native-backed `LightingSystem`
- lighting integration tests in
  [lighting-system.test.ts](/Users/sasha/craftvale/tests/lighting-system.test.ts)
- generic benchmark runner with lighting benchmark under
  [apps/cli/src/benchmarks/lighting.ts](/Users/sasha/craftvale/apps/cli/src/benchmarks/lighting.ts)

## Validation

The current expected validation for this area is:

- `bun run build:native`
- `bun run benchmark -- lighting`
- `bun run typecheck`
- `bun test`

Formatting and lint should also stay clean when this area changes:

- `bun run format:check`
- `bun run lint`
