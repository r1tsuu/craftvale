---
name: bun-opengl-project
description: Use when working in the bun-opengl repository on gameplay, world generation, rendering, persistence, UI, plans, or architecture/docs updates. This skill gives the repo-specific workflow, file map, and validation steps needed to make consistent changes safely.
---

# Bun OpenGL Project

## Overview

Use this skill for changes inside this voxel sandbox repo. Start by reading `architecture.md`, `README.md`, and the most relevant file under `plans/` if the task touches a feature area with an existing implementation plan.

## Workflow

1. Read the architecture first.
2. Inspect the concrete modules you will change instead of inferring behavior from the README alone.
3. Preserve the current client/server ownership model unless the task explicitly changes architecture.
4. After edits, run `bun test` and `bun run typecheck`.
5. If you changed the native bridge or other native-facing behavior, also run `bun run build:native`.

## Architecture Anchors

- `src/game-app.ts`: main app shell and client-side state owner.
- `src/index.ts`: tiny bootstrap only.
- `src/client/*`: replicated client runtime and worker-backed client adapter.
- `src/server/*`: authoritative world runtime, worker host, and binary storage.
- `src/shared/*`: typed message schemas, transport, and event-bus plumbing.
- `src/world/*`: chunks, deterministic worldgen, meshing, atlas, inventory helpers, and raycast.
- `src/render/*` and `src/ui/*`: terrain rendering, text, HUD, and menu/UI rendering.
- `src/platform/*` and `native/*`: Bun FFI bridge to GLFW/OpenGL.

## Repo-Specific Rules

- The worker-backed server is authoritative for chunk generation, block mutations, inventory, and persistence.
- `ClientWorldRuntime` is a replicated cache for rendering, raycast, and collision, not the source of truth.
- World generation must stay deterministic from the world seed. Avoid chunk-order-dependent generation.
- Terrain rendering is split into opaque and cutout passes; leaves rely on cutout alpha discard, not blended translucency.
- Inventory is per-world and server-authoritative. Keep place/break accounting on the server side.
- Prefer updating `plans/000N-*.md` when a feature meaningfully changes scope or architecture.

## Common Task Map

- Gameplay/input/UI loop changes: start with `src/game-app.ts`.
- Authoritative block/world/inventory behavior: start with `src/server/runtime.ts` and `src/server/authoritative-world.ts`.
- Persistence changes: start with `src/server/world-storage.ts`.
- Worldgen and biome/tree work: start with `src/world/terrain.ts`, `src/world/biomes.ts`, and `src/world/noise.ts`.
- Meshing/render changes: start with `src/world/mesher.ts`, `src/render/renderer.ts`, and `assets/shaders/`.
- Worker lifecycle/architecture changes: start with `src/server/worker-host.ts`.

## Validation

- Baseline: `bun test`
- Static check: `bun run typecheck`
- Native bridge touched: `bun run build:native`
- Docs/plans touched: confirm `README.md`, `architecture.md`, and relevant `plans/` entries still match the code
