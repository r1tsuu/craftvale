# World Loading Screen And Spawn Pregeneration

## Summary
Add an explicit loading screen when entering a world, and pre-generate a bounded chunk radius around the spawn area before gameplay begins. In local singleplayer, show a real progress percentage while the worker/server prepares that spawn region. In multiplayer, show a loading screen too, but keep the first pass simpler: wait for the server to deliver enough startup chunks without requiring exact percentage progress from remote servers.

## Key Changes

### Add an explicit loading app state
- The app should no longer jump directly from menu to gameplay while chunks stream in.
- Add a dedicated loading mode or loading sub-state in `GameApp`.
- The loading screen should own:
  - target world/server name
  - a user-visible status line
  - optional numeric progress percent
  - whether the load is local singleplayer or remote multiplayer
- This makes world entry feel intentional instead of showing a half-loaded scene.

### Pre-generate a spawn chunk radius before completing world entry
- Add a bounded pregeneration pass around the world spawn position.
- Recommended first pass:
  - choose a fixed chunk radius around spawn
  - generate all chunk layers in that radius
  - persist generated chunks if they were not already saved
- This should happen before the client is released into gameplay.
- Strong recommendation:
  - keep the pregeneration radius smaller than the full runtime render distance
  - optimize for a smooth first spawn, not full up-front world generation

### Make spawn pregeneration server-authoritative
- Pregeneration should happen on the authoritative side, not by client-side guessing.
- The authoritative world already owns chunk generation and persistence, so this pass should reuse that ownership.
- Good boundary:
  - `AuthoritativeWorld` exposes a spawn-area pregeneration routine
  - the world runtime/session path calls it before world join is considered complete
- This avoids duplicate chunk-generation logic between loading and normal requests.

### Add progress reporting for local singleplayer loading
- Local worker-backed singleplayer can and should report concrete progress.
- Add a server/worker progress event for world-entry loading, for example:
  - total chunk count
  - completed chunk count
  - percent or enough data for the client to compute percent
  - current stage label if helpful
- Recommended stages:
  - preparing world
  - generating spawn area
  - synchronizing initial player/world snapshot
  - ready
- Strong recommendation:
  - keep the event model simple and monotonic
  - avoid noisy per-block or per-mesh progress

### Keep multiplayer loading simpler in the first pass
- Remote multiplayer should also show a loading screen, but it does not need exact percentage progress in v1.
- Recommended first pass:
  - show a generic `CONNECTING`, `JOINING`, or `LOADING WORLD` state
  - complete loading once the initial join payload is applied and the required startup chunks are present
- This avoids coupling the remote protocol too tightly to local worker progress mechanics right away.
- If remote progress becomes important later, the same progress event shape can be extended to dedicated servers too.

### Define the initial chunk readiness rule clearly
- The loading screen needs a concrete exit condition.
- Strong recommendation:
  - for local singleplayer, exit when spawn pregeneration is complete and the client has applied the initial required chunk set
  - for multiplayer, exit when the joined payload is applied and the client has received the first required startup chunk set around the player
- Do not exit loading early just because the join request returned.

### Reuse pregenerated chunks during normal runtime
- Pregeneration should feed the same chunk cache/storage used by normal chunk requests.
- It should not create a second special startup-only chunk store.
- Expected effect:
  - initial `requestChunks` calls mostly hit already-generated data
  - spawn terrain appears immediately once gameplay begins
  - later runtime generation still works the same outside the pregenerated area

### Add menu-to-loading-to-play flow
- Update the current entry flow:
  - menu action
  - loading screen
  - gameplay
- The loading screen should block gameplay input and cursor-lock changes until entry is complete.
- Good UX details:
  - keep the same visual language as the rest of the UI
  - show world/server name
  - show percent only when available
  - show a failure message and return to menu cleanly if loading fails

### Keep worker single-world ownership intact
- The recent worker refactor should stay intact.
- Local world list/create/delete remains app-side.
- The worker should still only boot for one selected world.
- Pregeneration therefore happens inside that one-world worker runtime after initialization, not in a multiworld manager.

### Add a bounded, deterministic pregeneration algorithm
- Pregeneration order should be deterministic so progress feels stable and testable.
- Recommended order:
  - iterate chunk coordinates in a radius around spawn
  - prefer near-to-far ordering from the spawn chunk
  - include all active world layers for each `(x, z)` chunk coordinate
- This gives the best chance that the most visible nearby terrain is ready first if the system evolves toward incremental loading later.

### Add tests for loading and pregeneration behavior
- This feature changes startup sequencing, so it needs direct coverage.
- Important checks:
  - spawn pregeneration generates and persists the expected chunk set
  - local loading progress advances monotonically and reaches 100%
  - gameplay does not begin before the required startup chunks are ready
  - remote multiplayer still enters successfully with the loading screen path

### No backward compatibility required
- It is acceptable to replace the current direct menu-to-play flow.
- It is acceptable to add new worker/server events or reshape join sequencing.
- Existing local-only loading assumptions do not need shims.

## Important Files
- `plans/0022-world-loading-screen-and-spawn-pregeneration.md`
- `README.md`
- `architecture.md`
- `src/game-app.ts`
- `src/client/world-runtime.ts`
- `src/client/worker-client-adapter.ts`
- `src/server/runtime.ts`
- `src/server/authoritative-world.ts`
- `src/server/worker-host.ts`
- `src/server/worker-entry.ts`
- `src/server/dedicated-server.ts`
- `src/shared/messages.ts`
- `src/shared/event-bus.ts`
- `src/ui/menu.ts`
- `src/ui/*` for loading-screen composition
- `tests/client-server.test.ts`
- `tests/worker-host.test.ts`
- `tests/*` for loading-screen and pregeneration coverage

## Test Plan
- Pregeneration tests:
  - spawn-area pregeneration generates the expected chunk coordinate set
  - pregenerated chunks are available through normal chunk delivery paths
  - pregeneration respects saved chunks and does not corrupt existing persisted data
- Local loading-flow tests:
  - entering a local world goes through loading before play mode
  - progress events increase monotonically and finish at completion
  - the loading screen exits only after the required startup chunks are applied
- Multiplayer loading-flow tests:
  - joining a dedicated server shows a loading state before gameplay
  - multiplayer loading completes once joined payload and required startup chunks are ready
  - failure during connection or join returns cleanly to menu with a status message
- UI tests:
  - loading screen renders status text
  - percent text appears only when progress is available
  - world/server label is shown during loading

## Assumptions And Defaults
- Use the next plan filename in sequence: `0022-world-loading-screen-and-spawn-pregeneration.md`.
- Spawn pregeneration should be bounded and focused on startup smoothness, not large-scale world baking.
- Exact percentage progress is required for local singleplayer only in the first pass.
- Multiplayer may begin with generic loading text rather than true percentage progress.
- Worker singleplayer remains one-world-only and should not regain multiworld responsibilities.
