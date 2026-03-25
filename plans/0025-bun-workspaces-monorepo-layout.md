# Bun Workspaces Monorepo Layout

## Summary
Reorganize the repository into a Bun workspaces monorepo so the desktop client and dedicated server become explicit apps with clear package boundaries. The new shape should keep `native/` and `scripts/` at the repo root, move runtime entrypoints into `apps/client` and `apps/dedicated-server`, and consolidate only shared primitives plus authoritative server/runtime code into `packages/core`. The key goal is structural clarity, not a behavior rewrite: singleplayer should still boot an in-process worker-backed authoritative server from the client app, while dedicated multiplayer should still boot a standalone WebSocket server, but both should depend on the same shared core package instead of reaching into one flat `src/` tree.

## Benefits

### Clearer ownership
- Client-only concerns such as rendering, UI, input, native glue, and runtime assets live in `apps/client`.
- Dedicated-only process concerns live in `apps/dedicated-server`.
- Shared server/runtime and gameplay primitives live in `packages/core`.

### Less accidental coupling
- The dedicated server no longer needs to sit next to client-only modules in one flat source tree.
- `packages/core` stays focused on code actually shared by the singleplayer worker and dedicated server.
- Client assets and native integration stop leaking into shared runtime boundaries.

### Easier iteration and maintenance
- Workspace-local scripts and package boundaries make it easier to reason about what each runtime actually needs.
- Refactors become safer because moving client code should not affect dedicated-server packaging by accident.
- Future packaging, build, and test improvements can happen per workspace instead of through one oversized app surface.

### Better pathing and asset semantics
- `apps/client/assets` makes runtime asset ownership obvious.
- Root `native/` remains centralized without forcing client render assets to be repo-global too.
- Shared code avoids hidden assumptions about repo-root asset locations.

## Target Layout

### Root stays responsible for shared non-workspace assets and tooling
- Keep these directories at the project root:
  - `native/`
  - `scripts/`
  - `plans/`
  - `tests/` unless we later split package-local tests deliberately
- Add Bun workspace configuration at the root for:
  - `apps/*`
  - `packages/*`
- Keep the root as the place for:
  - top-level scripts that orchestrate multi-app dev flows
  - shared TypeScript config bases
  - repo-wide docs and architecture notes
  - native build outputs and repo-wide tooling only

### `apps/client`
- `apps/client` should own the desktop app runtime and client-only composition.
- This app should contain:
  - the client bootstrap entrypoint currently living in `src/index.ts`
  - app startup and client-local CLI handling
  - singleplayer worker startup wiring
  - local player profile and client settings composition
  - saved-server composition and menu launch wiring
  - rendering, HUD/UI, input, native/platform glue, and client-only replicated runtime behavior
  - runtime-loaded client assets such as shaders and textures
- Important constraint:
  - `apps/client` should still be allowed to start the authoritative server for singleplayer
  - but that server implementation should come from `packages/core`, not from a client-local reimplementation

### `apps/dedicated-server`
- `apps/dedicated-server` should own dedicated WebSocket serving and dedicated-only process concerns.
- This app should contain:
  - the standalone server bootstrap currently living in `src/server/standalone-entry.ts`
  - dedicated-only CLI parsing and process startup
  - port checks, server-dir handling, and dedicated process logging
  - Bun `serve` composition and dedicated process lifecycle wiring
- It should not own gameplay rules directly; it should compose them from `packages/core`.

### `packages/core`
- `packages/core` should contain only code that is shared by the singleplayer worker server and the dedicated WebSocket server, plus neutral shared primitives used by the client to talk to them.
- This package should own:
  - authoritative server/runtime code
  - world generation and chunk/world data structures
  - persistence/storage formats
  - typed messages, event bus, codecs, and transport contracts
  - inventory/item/block rules and other gameplay data/model code that is not client-app-specific
- This package should not become a home for client-app systems such as:
  - rendering
  - HUD/UI composition
  - native bridge/platform glue
  - menu/input composition
  - client-only app bootstrapping
- Strong recommendation:
  - keep `packages/core` as the single shared package first
  - do not prematurely split it into many tiny packages until workspace boundaries prove stable

## Package Boundary Rules

### Client app boundary
- `apps/client` may depend on `packages/core`.
- `apps/client` owns its own runtime assets under `apps/client/assets`.
- `apps/client` may load the repo-root native bridge from `native/`.
- `apps/client` should not be imported by any other workspace.
- `apps/client` owns process-local composition, not shared gameplay logic.

### Dedicated server app boundary
- `apps/dedicated-server` may depend on `packages/core`.
- `apps/dedicated-server` may use root `scripts/` conventions and root native/tooling paths only where needed for startup.
- `apps/dedicated-server` should not import client-only bootstrap code.
- `apps/dedicated-server` should not depend on client runtime assets.

### Core package boundary
- `packages/core` should not depend on either app package.
- `packages/core` should expose stable entry surfaces for:
  - client-side app/runtime composition helpers
  - authoritative server runtime creation
  - worker-backed singleplayer server hosting
  - dedicated-server runtime creation helpers
- Avoid putting root-relative path assumptions deep inside `packages/core` when they are really app concerns.

## Suggested Directory Mapping

### Move current client bootstrap into `apps/client`
- Expected moves:
  - current `src/index.ts` -> `apps/client/src/index.ts`
  - any client-app-specific CLI or startup composition should live nearby
- `GameApp` should move into `apps/client` because it is client-app composition:
  - menu/loading/play mode ownership
  - renderer and native bridge lifecycle
  - input handling
  - client adapter selection
  - singleplayer worker boot decisions
  - HUD/UI flow
- `packages/core` should provide the shared runtime pieces `GameApp` composes, not own `GameApp` itself.

### Move current dedicated bootstrap into `apps/dedicated-server`
- Expected moves:
  - current `src/server/standalone-entry.ts` -> `apps/dedicated-server/src/index.ts`
  - dedicated-only port/prompt/process startup helpers can move with it if they are not reused by the client app

### Move reusable code into `packages/core`
- Likely moves:
  - `src/server/*` -> `packages/core/src/server/*`
  - `src/shared/*` -> `packages/core/src/shared/*`
  - server-facing parts of `src/world/*` -> `packages/core/src/world/*`
  - shared non-client-specific parts of `src/math/*` and `src/utils/*` -> `packages/core/src/*`
- Strong recommendation:
  - do not move `src/render/*`, `src/ui/*`, or `src/platform/*` into `packages/core`
  - move only the client/server protocol and gameplay primitives that are genuinely shared

### Move client-owned code into `apps/client`
- Likely moves:
  - `src/index.ts` -> `apps/client/src/index.ts`
  - `src/game-app.ts` -> `apps/client/src/game-app.ts`
  - `src/client/*` -> `apps/client/src/client/*`
  - `src/render/*` -> `apps/client/src/render/*`
  - `src/ui/*` -> `apps/client/src/ui/*`
  - client-facing parts of `src/game/*` -> `apps/client/src/game/*`
  - `src/platform/*` -> `apps/client/src/platform/*`
- Client app code can still import shared world/model/message types from `packages/core`.

## Worker And Transport Ownership

### Singleplayer worker startup stays client-owned
- The desktop app should continue to own the decision to boot a local worker for singleplayer.
- Recommended shape:
  - `apps/client` starts the worker
  - the worker entrypoint imports server/runtime logic from `packages/core`
  - worker transport contracts and shared server-facing host/controller logic live in `packages/core`
- This keeps singleplayer as an app concern while preserving one authoritative server implementation.

### Dedicated WebSocket transport stays dedicated-app-owned at the edge
- The dedicated app should continue to own:
  - `Bun.serve`
  - port prompts
  - dedicated process lifecycle
- But request handling, session control, world authority, and typed transport semantics should remain inside `packages/core`.

## Root Scripts And Developer Workflow

### Keep root-level convenience commands
- Keep root orchestration commands such as:
  - `dev:client`
  - `dev:server`
  - `dev:full`
  - clean variants
- Those scripts can call into workspace app commands rather than direct old flat-source entrypoints.

### Add workspace-local scripts
- Each workspace should expose its own local commands:
  - `apps/client`: dev, build, typecheck as needed
  - `apps/dedicated-server`: dev, build, typecheck as needed
  - `packages/core`: test and typecheck focused on shared code
- The root should remain the easiest place to run end-to-end flows.

## TypeScript And Module Resolution

### Introduce a root base config
- Add a root shared TS config for common compiler options.
- Each workspace should extend that base and set:
  - its own `rootDir`
  - its own `outDir` if builds are emitted
  - explicit path aliases only if they stay simple

### Prefer package imports over deep relative paths
- Replace long `../../..` imports with workspace package imports where practical.
- Good target:
  - app code imports shared runtime pieces from `packages/core`
- Avoid overcomplicated aliasing if normal workspace package resolution is sufficient.

## Assets, Native Bridge, And Path Policy

### Move runtime client assets into `apps/client`
- Runtime-loaded shaders, textures, and similar client-only assets should live under `apps/client/assets`.
- This matches ownership better:
  - the client app renders and loads them
  - the dedicated server does not need them
  - `packages/core` avoids hidden path assumptions about client asset locations
- If we later introduce shared authoring assets or generation inputs, those can live at the repo root intentionally, but client runtime assets should default to the client app.

### Keep `native/` at the root
- The native bridge build should remain centralized under `native/`.
- `apps/client` should consume it through a stable path resolver.
- `apps/dedicated-server` should not depend on the native bridge unless a dedicated-only feature genuinely requires it.

## Testing Strategy

### Preserve existing coverage while migrating layout
- The first monorepo pass should keep tests readable and reliable rather than perfectly redistributed.
- Acceptable first-pass options:
  - keep most tests under root `tests/` and update imports
  - or move only clearly package-local tests into `packages/core/tests`
- Strong recommendation:
  - do not mix structural migration with a full testing philosophy rewrite

### Validate both app entrypoints explicitly
- Add smoke coverage for:
  - client app bootstrap still starting correctly with workspace paths
  - dedicated server bootstrap still starting correctly with workspace paths
  - singleplayer worker startup still reaching the shared authoritative core

## Suggested Implementation Order
1. Add Bun workspace configuration and package manifests without moving code yet.
2. Create `apps/client`, `apps/dedicated-server`, and `packages/core` with minimal entrypoints.
3. Move reusable code from `src/` into `packages/core/src/` while preserving behavior.
4. Move client bootstrap into `apps/client` and dedicated bootstrap into `apps/dedicated-server`.
5. Update root scripts to call workspace app entrypoints.
6. Fix asset/native path resolution through explicit helpers.
7. Update tests, docs, and architecture notes to describe the new layout.
8. Delete the old flat `src/` bootstrap locations once all imports and commands are stable.

## Important Files
- `plans/0025-bun-workspaces-monorepo-layout.md`
- `package.json`
- `tsconfig.json`
- root Bun workspace config if added separately
- `apps/client/package.json`
- `apps/client/src/index.ts`
- `apps/dedicated-server/package.json`
- `apps/dedicated-server/src/index.ts`
- `packages/core/package.json`
- `packages/core/src/**/*`
- `scripts/*`
- `README.md`
- `architecture.md`

## Test Plan
- Workspace/bootstrap tests:
  - root dev commands still invoke the correct workspace entrypoints
  - client app boot still works with local singleplayer worker startup
  - dedicated server boot still works with WebSocket startup
- Pathing tests:
  - `apps/client/assets` still load correctly from the client app
  - root `native/` still resolves correctly for the client app
  - server-only app does not accidentally require native desktop code
- Shared-core tests:
  - existing gameplay, inventory, persistence, and transport tests still run against `packages/core`
  - worker-host and dedicated-server flows still use the same authoritative runtime code
- Manual smoke tests:
  - `dev:client`
  - `dev:server`
  - `dev:full`
  - local singleplayer world join
  - dedicated multiplayer join through localhost

## Assumptions And Defaults
- Use the next plan filename in sequence: `0025-bun-workspaces-monorepo-layout.md`.
- This is primarily a repository-structure refactor, not a gameplay feature change.
- `native/` and `scripts/` stay at the repo root.
- runtime client assets move to `apps/client/assets`.
- `apps/client` owns the desktop app and singleplayer worker startup.
- `GameApp` is part of the client app layer and belongs in `apps/client`, not `packages/core`.
- `apps/dedicated-server` owns WebSocket and dedicated-only process concerns.
- `packages/core` owns shared primitives plus the authoritative server code used by both singleplayer and dedicated multiplayer, not the client app layer.
