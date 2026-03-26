# Server Tick Loop And Authoritative Intent Queue

## Summary

Introduce a real authoritative server tick loop with a Minecraft-like target of `20 TPS` and move gameplay mutation handling onto that cadence instead of applying most state changes immediately on transport event receipt. The goal is to make world simulation, block updates, entity state, future lighting work, and replication timing more deterministic and easier to reason about across both the local worker and dedicated server paths.

## Key Changes

### Add a fixed authoritative server tick loop

- Add a shared tick loop in the server runtime layer with a target cadence of:
  - `20 TPS`
  - `50 ms` target tick interval
- Recommended behavior:
  - accumulate real time
  - run zero or more fixed ticks when enough time has elapsed
  - cap catch-up work to avoid runaway stalls if the server falls behind
- Important requirement:
  - both the singleplayer worker and dedicated server should use the same authoritative tick semantics

### Move gameplay intent handling from immediate execution to queued execution

- Incoming gameplay events should no longer directly mutate authoritative world state on receipt.
- Instead, queue intents for the next server tick.
- Good first-pass intents to queue:
  - `mutateBlock`
  - `selectInventorySlot`
  - inventory interaction events if they are gameplay-relevant enough to benefit from tick ordering
  - future attack/use/interact actions
- Events that are more request/response or IO-oriented can stay immediate:
  - `joinWorld`
  - `requestChunks`
  - `saveWorld`
- This gives us one canonical ordering point for gameplay state changes.

### Introduce explicit tick input buffers per session/world

- Add a lightweight authoritative intent queue owned by the active world session or runtime.
- Recommended model:
  - transport handlers validate and enqueue intents
  - each server tick drains queued intents in arrival order
  - the world applies them within the tick
- Strong recommendation:
  - keep queue ownership world-scoped, not global process-scoped
  - preserve deterministic ordering for intents within a single tick

### Run world simulation once per tick

- Move world simulation work onto the tick loop rather than piggy-backing on individual message handlers.
- Good first-pass simulation tasks:
  - dropped item motion and pickup checks
  - player/session-driven world-state updates that should happen consistently
- Future tick-owned systems:
  - scheduled block updates
  - random ticks
  - simple fluid logic if ever added
  - lighting propagation / relighting jobs
  - mob AI / physics if entities expand later

### Batch authoritative replication per tick

- Instead of broadcasting chunk or entity updates immediately from each incoming message, collect authoritative changes during a tick and emit them after the tick completes.
- Recommended outputs to batch:
  - changed chunks
  - player updates
  - dropped item spawn/update/remove events
  - inventory changes
  - chat/system/status messages only if they are tick-produced
- Benefits:
  - one coherent world state per tick
  - less replication churn from multiple mutations in one frame
  - easier future delta compression if needed

### Define tick-time behavior when the server lags

- Mirror Minecraft-style expectations:
  - target `20 TPS`
  - if a tick runs long, the server can temporarily fall below target TPS
  - do not pretend the server is still real-time correct when it is overloaded
- Recommended safeguards:
  - cap max fixed ticks per outer loop iteration
  - log tick overruns with measured duration and effective TPS
  - expose tick stats for debug overlay/logging later if useful
- Avoid trying to “catch up forever” in one burst.

### Separate simulation time from render/client time more clearly

- The client already renders every frame and may predict some actions immediately.
- With a ticked server:
  - clients still send intents immediately
  - clients may still do limited prediction for responsiveness
  - authoritative state only advances on ticks
- That makes reconciliation cleaner:
  - prediction fills responsiveness gaps
  - ticks define truth boundaries
  - replication confirms or corrects predicted state

### Keep the first pass intentionally scoped

- Do not try to add full redstone-like scheduled updates, fluid systems, and lighting in the same implementation.
- The first pass should focus on:
  - the runtime tick loop
  - queued block and inventory intents
  - dropped-item simulation on ticks
  - per-tick replication batching
- Capture future systems as explicit follow-on work, not hidden scope creep.

### Define mutation and raycast expectations under ticked authority

- Block break/place requests should be interpreted as intents against authoritative state at the time the server processes the tick.
- The client may still raycast and predict locally for feel, but the authoritative server decides the final outcome on the next tick.
- This gives a cleaner mental model for fast repeated clicks:
  - multiple clicks can queue multiple break intents
  - each tick resolves them in order
  - authoritative chunk updates arrive from the tick result

### Preserve the existing shared server architecture boundary

- Keep the tick system in shared server code under `packages/core/src/server`.
- Do not make `apps/client` or `apps/dedicated-server` own independent tick rules.
- Recommended ownership:
  - `ServerRuntime` owns the main tick driver
  - `WorldSessionController` owns intake/enqueue behavior for session intents
  - `AuthoritativeWorld` owns per-tick world application and simulation logic

### Add explicit per-tick world result objects

- Expand the current mutation/simulation outputs toward a single “tick result” shape.
- Recommended contents:
  - changed chunk payloads
  - inventory changes keyed by player
  - player updates
  - dropped item updates
  - chat/system messages emitted during the tick
  - diagnostics such as tick duration if needed
- This will make batching and testing much simpler than spreading replication logic across many handlers.

## Important Files

- `plans/0028-server-tick-loop-and-authoritative-intent-queue.md`
- `architecture.md`
- `packages/core/src/server/runtime.ts`
- `packages/core/src/server/world-session-controller.ts`
- `packages/core/src/server/authoritative-world.ts`
- `packages/core/src/server/dropped-item-system.ts`
- `packages/core/src/server/server-adapter.ts`
- `packages/core/src/shared/messages.ts`
- `apps/client/src/worker/host.ts`
- `apps/dedicated-server/src/index.ts`
- `tests/client-server.test.ts`
- `tests/dedicated-server.test.ts`
- `tests/authoritative-world.test.ts`
- `tests/worker-host.test.ts`

## Test Plan

- Runtime/tick-loop tests:
  - server runtime advances authoritative world ticks at fixed-step cadence
  - lagged runtime caps catch-up work instead of spiraling
  - queued intents are processed in order on tick boundaries
- World/session tests:
  - multiple block mutations queued before a tick are all applied deterministically
  - dropped item simulation advances only on ticks
  - inventory updates from queued actions are emitted after tick processing
- Client/server integration tests:
  - rapid repeated block-break intents no longer depend on message-handler timing
  - local worker and dedicated server produce equivalent authoritative outcomes for the same queued actions
  - chunk/entity/inventory replication reflects per-tick batched world state
- Manual smoke tests:
  - break/place blocks rapidly and confirm behavior is stable and repeatable
  - collect dropped items and confirm pickup behavior remains smooth
  - join local and dedicated sessions and confirm both feel behaviorally aligned
  - induce artificial server delay and confirm effective TPS drops visibly instead of causing broken simulation order

## Assumptions And Defaults

- Use the next plan filename in sequence: `0028-server-tick-loop-and-authoritative-intent-queue.md`.
- The target authoritative cadence is `20 TPS`, but the server may fall below that under load.
- The first implementation should prioritize determinism and clean ownership over advanced optimization.
- Limited client prediction should remain acceptable, but the server tick becomes the primary authority boundary for gameplay state advancement.
