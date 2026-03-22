# Instance-Driven App And Global State Removal

## Summary
Refactor the runtime so the app no longer depends on module-level singleton instances and mutable globals for core behavior. The goal is to move from "import module, mutate shared state, and let top-level code run" toward explicit app/server instances with owned state, injected dependencies, and lifecycle methods. This should make the code easier to test, easier to reason about, safer to extend, and more flexible for future features like alternate frontends, dedicated servers, headless simulation, or multiple app instances in the same process.

## Key Changes

### Replace top-level singleton bootstrap in `src/index.ts`
- Remove module-scope construction and mutation for objects like:
  - `NativeBridge`
  - `WorkerClientAdapter`
  - `ClientWorldRuntime`
  - `PlayerController`
  - `VoxelRenderer`
- Replace the current top-level script flow with an explicit app/controller instance, for example:
  - `GameApp`
  - `ClientApp`
  - or similarly named runtime shell
- This instance should own:
  - dependencies
  - mutable app state
  - event subscriptions
  - update/render loop
  - startup/shutdown behavior

### Consolidate mutable runtime state into owned instance fields
- Move module-level mutable values in `src/index.ts` into a single state owner, including:
  - timing accumulators
  - input edge tracking
  - mode/menu state
  - current world/session identifiers
  - transient HUD/status text
- Keep this state explicit and grouped rather than spread across many free variables.
- Prefer a small number of cohesive instance fields or nested state objects over many unrelated mutable locals.

### Explicit dependency injection
- Pass dependencies into constructors/factories instead of importing and constructing them at module scope.
- Candidate dependencies include:
  - native bridge
  - client adapter
  - client world runtime
  - renderer
  - player controller
  - menu/random seed provider if desired
- Keep construction centralized in one bootstrap function so the rest of the app can be instantiated in tests with fakes/stubs.

### Event wiring as lifecycle-managed subscriptions
- Move event-bus handler registration out of module scope and into instance setup.
- Ensure subscriptions are registered during startup and cleaned up during shutdown where needed.
- Keep the app’s reaction to server events as instance methods, for example:
  - `handleChunkDelivered(...)`
  - `handleInventoryUpdated(...)`
  - `handleWorldDeleted(...)`
- This avoids hidden coupling between imported modules and ambient mutable state.

### Separate bootstrap from execution
- Add a clear split between:
  - constructing/configuring the app
  - starting the main loop
  - shutting down and flushing state
- Recommended shape:
  - `createApp(...)`
  - `app.start()`
  - `app.run()`
  - `app.shutdown()`
- Keep `src/index.ts` minimal so it mainly wires dependencies and invokes the app entrypoint.

### Worker/server entrypoint cleanup
- Remove the `runtime` and `adapter` globals from `src/server/worker-entry.ts`.
- Replace them with an explicit worker host/controller instance that owns initialization state and message dispatch.
- The worker entry should become a thin adapter around an instance such as:
  - `WorkerServerHost`
  - `ServerWorkerRuntime`
- This keeps worker lifecycle logic aligned with the main app refactor instead of leaving a second global-state island behind.

### Pure helpers vs stateful services
- Keep truly pure/value-oriented modules as plain functions:
  - math helpers
  - biome/noise sampling
  - meshing helpers where appropriate
  - UI evaluation helpers
- Only wrap code in classes/services when it owns lifecycle, side effects, or mutable state.
- The goal is not "everything becomes a class"; the goal is "stateful behavior gets an owner."

### Testability improvements
- Make it possible to instantiate the main app with:
  - fake transport/client adapter
  - fake native bridge
  - fake renderer or loop driver
- Avoid hidden behavior at import time so tests can construct the system deterministically.
- If needed, extract one-tick update/render methods to support unit testing without spinning a real loop.

### Shutdown and resource ownership
- Define clear ownership for shutdown responsibilities:
  - saving current world
  - closing transport/worker adapter
  - shutting down native bridge
  - releasing render resources if future cleanup becomes necessary
- Ensure shutdown order is explicit and instance-owned rather than spread across `finally` blocks that close over globals.

## Important Public Interfaces/Types
- Add an app/runtime shell type such as:
  - `GameApp`
  - `GameAppState`
  - `GameAppDependencies`
- Add a worker host/controller type for the server worker entrypoint.
- Keep `src/index.ts` as a small bootstrap file that constructs and runs the app instance.
- Existing pure helper APIs can remain function-based where they do not own state.

## Test Plan
- App bootstrap tests:
  - app instance can be constructed with injected fakes
  - no meaningful side effects happen merely from importing the app module
- Runtime tests:
  - one update tick advances owned state correctly
  - server events update instance-owned state without relying on module globals
  - shutdown calls save/close hooks in the expected order
- Worker tests:
  - worker host rejects gameplay messages before initialization
  - worker host initializes once and dispatches messages through owned instance state
- Regression smoke tests:
  - menu flow still works
  - join world, receive chunks, break/place blocks, and save still work
  - inventory and biome-based terrain behavior remain unchanged after the refactor

## Assumptions And Defaults
- This pass is primarily architectural; it should preserve current gameplay behavior and visuals.
- Pure stateless helpers should stay as plain functions unless there is a strong reason otherwise.
- One app instance and one worker host instance per process is still the default runtime model; the refactor simply removes ambient/global reliance.
- Use the next plan filename in sequence: `0007-instance-driven-app-and-global-state-removal.md`.
