---
name: craftvale
description:
  Use when working in the Craftvale repository on gameplay, world generation,
  rendering, persistence, UI, plans, or architecture/docs updates. This skill
  gives the repo-specific workflow, file map, and validation steps needed to
  make consistent changes safely.
---

# Craftvale

## Overview

Use this skill for changes inside this voxel sandbox repo. Start by reading
`architecture.md`, `README.md`, and the most relevant file under `plans/` if the
task touches a feature area with an existing implementation plan.

## Workflow

1. Read the architecture first.
2. Inspect the concrete modules you will change instead of inferring behavior
   from the README alone.
3. Preserve the current workspace ownership model unless the task explicitly
   changes architecture.
4. When you touch repo tooling or broad code style, use `bun run format` and
   `bun run lint` so edits match the repo's Prettier and ESLint setup.
5. After edits, run `bun test` and `bun run typecheck`.
6. If you changed native build/tooling or asset preprocessing, also run the
   relevant `apps/cli` command such as `bun run build:native`.

## Architecture Anchors

- `apps/cli/src/*`: developer tooling, native builds, cleanup, combined dev
  orchestration, and preprocessing such as atlas generation.
- `apps/client/src/app/game-app.ts`: main app shell and client-side state owner.
- `apps/client/src/index.ts`: client bootstrap only.
- `apps/client/src/app/*`: app shell, replicated client runtime, profiles/settings,
  server browser, and client transport adapters.
- `apps/client/src/render/*`, `apps/client/src/ui/*`,
  `apps/client/src/game/*`, and `apps/client/src/platform/*`: rendering,
  HUD/menu/UI, player/input logic, and native integration.
- `apps/client/src/worker/*`: singleplayer worker startup and worker-only glue.
- `apps/dedicated-server/src/*`: dedicated-only process bootstrap and
  WebSocket server wiring.
- `packages/core/src/server/*`: authoritative server/runtime code shared
  between the singleplayer worker and dedicated server.
- `packages/core/src/shared/*`: shared message schemas, codecs, transport
  contracts, CLI helpers, logging, math, and other neutral shared utilities.
- `packages/core/src/world/*`: chunks, deterministic worldgen, meshing, block
  and item registries, inventory helpers, and raycast.
- `native/*`: Bun FFI bridge to GLFW/OpenGL.

## Repo-Specific Rules

- The worker-backed server is authoritative for chunk generation, block
  mutations, inventory, and persistence.
- `apps/cli` owns repo tooling and preprocessing; do not leave new build,
  cleanup, or content-generation scripts at the repo root.
- `apps/client` owns client-only behavior such as rendering, UI, input, local
  worker startup, and communication with the authoritative server.
- `apps/dedicated-server` owns dedicated-only networking/process behavior such
  as WebSocket serving and dedicated bootstrap.
- `packages/core/src/server` is for server code that is shared between the
  singleplayer worker and dedicated server.
- `packages/core/src/shared` is for shared types, utilities, math, and neutral
  client/server protocol helpers.
- `ClientWorldRuntime` is a replicated cache for rendering, raycast, and
  collision, not the source of truth.
- World generation must stay deterministic from the world seed. Avoid
  chunk-order-dependent generation.
- Terrain rendering is split into opaque and cutout passes; leaves rely on
  cutout alpha discard, not blended translucency.
- Inventory is per-world and server-authoritative. Keep place/break accounting
  on the server side.
- Commit subjects should use `<type>: <summary>` with one of `fix:`, `feat:`,
  `refactor:`, `test:`, `docs:`, `chore:`, `build:`, or `format:`, and every
  commit should include a body describing what changed.
- Commits created through Codex should include the trailer
  `Co-authored-by: Codex <codex@openai.com>`.
- Prefer updating `plans/000N-*.md` when a feature meaningfully changes scope or
  architecture.

## Common Task Map

- Tooling, native build flow, cleanup commands, or preprocessing: start with
  `apps/cli/src/*`.
- Gameplay/input/UI loop changes: start with `apps/client/src/app/game-app.ts`.
- Authoritative block/world/inventory behavior: start with
  `packages/core/src/server/runtime.ts` and
  `packages/core/src/server/authoritative-world.ts`.
- Persistence changes: start with `packages/core/src/server/world-storage.ts`.
- Worldgen and biome/tree work: start with `packages/core/src/world/terrain.ts`,
  `packages/core/src/world/biomes.ts`, and `packages/core/src/world/noise.ts`.
- Meshing/render changes: start with `packages/core/src/world/mesher.ts`,
  `apps/client/src/render/renderer.ts`, and `apps/client/assets/shaders/`.
- Dedicated WebSocket/bootstrap changes: start with
  `apps/dedicated-server/src/index.ts` and
  `apps/dedicated-server/src/dedicated-server.ts`.
- Singleplayer worker lifecycle changes: start with
  `apps/client/src/worker/*`.

## Validation

- Formatting: `bun run format:check`
- Lint: `bun run lint`
- Baseline: `bun test`
- Static check: `bun run typecheck`
- Native bridge or tooling touched: `bun run build:native`
- Docs/plans touched: confirm `README.md`, `architecture.md`, and relevant
  `plans/` entries still match the code
