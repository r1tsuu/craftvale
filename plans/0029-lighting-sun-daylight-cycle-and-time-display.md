# Lighting, Sun, Daylight Cycle, And Time Display

## Summary

Introduce a first-pass world lighting model with a moving sun and authoritative day/night time progression, then expose that time through a server-authoritative `/timeset` command and a simple HUD clock. This milestone should also introduce one concrete emissive block, `glowstone`, so the lighting system covers both daylight and block-emitted light in a real gameplay path. Architecturally, this should land as an explicit world-owned system, parallel to `PlayerSystem` and `DroppedItemSystem`, rather than as scattered chunk helpers or renderer-owned logic. The first implementation should stay disciplined: use a Minecraft-like global daylight cycle, support sun-driven outdoor brightness plus chunk-level propagated light data, keep time ownership on the server, include `glowstone` as the only placeable emitted-light source in v1, and avoid pulling torches, colored lights, weather, moon phases, or full sky rendering into the same milestone unless they are required to make the daylight system coherent.

## Key Changes

### Add explicit authoritative world time

- Introduce world-level time state owned by the authoritative server/runtime instead of letting the client infer time locally.
- Recommended first-pass fields:
  - `timeOfDayTicks`
  - `dayCount` or an equivalent absolute tick counter if convenient
  - optional cached daylight factor if that simplifies replication/rendering
- Strong recommendation:
  - keep time advancement in shared server code under `packages/core/src/server`
  - advance time on the authoritative tick loop added in `0028`
  - persist time with the world save so reloads resume at the expected part of the day
- Minecraft-like default:
  - `24000` ticks per full day
  - a daylight curve that is brightest near noon and darkest at night

### Define a global daylight model and sun direction

- Add a small shared time/lighting helper layer that converts authoritative world time into:
  - normalized day progress
  - daylight intensity
  - sun angle/direction
  - optional named phases such as dawn, day, dusk, and night
- This should be a pure helper boundary, not renderer-owned state.
- Strong recommendation:
  - keep the sun model simple and deterministic
  - use one directional sun light for terrain shading
  - reserve moonlight, stars, and weather-tinted sky for later plans
- The client renderer should consume the derived sun state rather than own its own clock.

### Add an explicit world lighting system boundary

- Introduce a dedicated server-side lighting system, for example `LightingSystem` or `WorldLightingSystem`, owned by `AuthoritativeWorld`.
- This system should be treated like the other world-owned subsystems:
  - `PlayerSystem` owns player-specific authoritative state and persistence
  - `DroppedItemSystem` owns dropped-item simulation and persistence
  - the lighting system should own world time progression, light-level storage, relight queues, propagation, and any lighting-specific save/load behavior
- Strong recommendation:
  - do not spread lighting rules across `AuthoritativeWorld`, terrain generation, chunk classes, and renderer code without a clear owner
  - let `AuthoritativeWorld` orchestrate the system, but keep the lighting rules and queues behind an explicit subsystem boundary
  - keep renderer code as a consumer of replicated lighting outputs, not the owner of propagation behavior
- Good first-pass ownership split:
  - shared helpers define time-of-day math and pure light-propagation utilities
  - `LightingSystem` owns mutable authoritative light/time state for one world
  - `AuthoritativeWorld` coordinates the lighting system with chunk load/save, mutation, and replication

### Add chunk/block lighting data suitable for sunlight and block-light propagation

- Introduce explicit light storage in chunk/world data so outdoor spaces respond to sunlight, underground spaces darken correctly, and emissive blocks can light nearby terrain.
- Strong recommendation:
  - model lighting as Minecraft-like integer light levels, for example `0..15`
  - keep those light levels as authoritative world data calculated on the server
  - replicate resulting lighting/chunk updates to clients instead of asking the renderer to infer propagation locally
- The first-pass lighting model should prioritize:
  - sky/sun light propagation
  - block-light propagation for emissive blocks
  - chunk-local storage that can be meshed/rendered efficiently
  - relighting when terrain changes open or block the sky
- Recommended first-pass scope:
  - one sunlight channel
  - one block-light channel
  - one concrete emissive gameplay block: `glowstone`
- Good default mental model:
  - each voxel can carry separate sky-light and block-light levels
  - sunlight enters from above at full strength
  - opaque blocks stop direct sky light
  - block light emits outward from emissive voxels with falloff
  - both light channels propagate with explicit, testable falloff rules chosen to fit the engine
- Important discipline:
  - do not hide torches, lava emission, or colored lights inside this plan
  - but shape the chunk/light storage so those can be added later without a rewrite after `glowstone`

### Add `glowstone` as the first emissive block/item

- Introduce a new block and corresponding inventory item for `glowstone`.
- Good first-pass expectations:
  - `glowstone` is placeable like the other block-backed items
  - breaking `glowstone` drops the matching glowstone item
  - placed `glowstone` emits block light immediately through the authoritative lighting system
- Strong recommendation:
  - wire `glowstone` through the existing block registry, item registry, drop mapping, atlas/content generation, and inventory naming/color helpers
  - keep the light emission value explicit in block metadata rather than scattering special cases through the relighting code
- This gives the lighting system one real gameplay-facing emissive source without committing the milestone to a broad utility-block pass.

### Integrate lighting with world generation, chunk loading, and mutation

- Newly generated chunks should initialize their sunlight state as part of generation/load readiness rather than leaving lighting as a client-only post-process.
- World/chunk ownership should stay authoritative:
  - chunk generation computes an initial lighting baseline
  - loading persisted chunks restores saved lighting state
  - block break/place on the server queues relighting work through the authoritative tick path
  - placing or removing `glowstone` updates local block-light propagation through that same authoritative path
- Recommended implementation boundary:
  - the lighting system owns block light level calculation and propagation queues
  - the lighting system advances authoritative world time on ticks or through a world-owned tick callback
  - clients consume replicated light levels as render/input data only
- Recommended default:
  - persist computed light levels with each saved chunk
  - use recomputation on load only as a fallback for legacy saves, migration paths, or detected invalid light data
- Reasoning:
  - persisted light levels make chunk loads cheaper and more predictable
  - they avoid large relight spikes when loading explored worlds
  - they fit the current authoritative save model better than treating lighting as disposable client-adjacent cache data
- Strong recommendation:
  - keep relighting jobs owned by the lighting system, not by the renderer or ad hoc world helpers
  - batch lighting updates into the existing tick/result flow so replication remains coherent
- This plan should explicitly account for cross-chunk boundaries so skylight changes near chunk edges do not become visually inconsistent.

### Extend chunk meshing and rendering to use light values

- Terrain meshing should emit enough lighting information for the renderer to shade faces based on the propagated light state instead of only using the current coarse directional face shading.
- Recommended first-pass rendering behavior:
  - preserve existing face-direction readability
  - multiply or bias that face shading by the block/face light level
  - let nearby `glowstone` visibly brighten surrounding terrain and exposed faces
  - update chunk meshes when lighting changes materially affect visible faces
- Keep this compatible with the existing opaque/cutout terrain split.
- Strong recommendation:
  - lighting data should travel with chunk render data, not be re-queried expensively every frame
  - avoid introducing a full deferred renderer or per-pixel dynamic lighting system

### Add a simple sky/background response to time of day

- The world should visually read as daytime or nighttime even before advanced atmosphere work exists.
- Reasonable first-pass visuals:
  - background clear color driven by daylight intensity
  - sun direction available to the renderer for terrain shading
  - optional subtle dawn/dusk tinting if cheap and readable
- Keep the first pass restrained:
  - no textured sun/moon billboards required
  - no volumetric sky, clouds, stars, or weather
- The goal is for the player to clearly feel the day progressing, not to ship a full skybox system.

### Replicate world time and lighting changes to clients deliberately

- Clients need authoritative time-of-day data for HUD display and rendering.
- Recommended replication model:
  - include world-time state in join payloads
  - send periodic authoritative time updates or include them in existing tick/world update flows
  - replicate chunk lighting changes through the same changed-chunk path used for terrain mutations
- Strong recommendation:
  - do not rely on free-running client clocks without correction
  - clients may interpolate visuals smoothly between authoritative updates, but the server remains the source of truth

### Add `/timeset` as a server-authoritative command

- Extend the existing slash-command path so players can set world time through chat.
- First-pass command scope:
  - `/timeset <value>`
- Recommended accepted values:
  - numeric tick values such as `/timeset 6000`
  - named presets such as `sunrise`, `day`, `noon`, `sunset`, `night`, and optionally `midnight`
- Expected behavior:
  - the server validates input
  - updates authoritative world time immediately
  - triggers any required relighting/daylight recalculation
  - emits system feedback confirming the result
- Strong recommendation:
  - keep the first pass self-targeted and world-scoped, similar to `/gamemode`
  - no permissions/admin model is required unless the current multiplayer goals demand it immediately

### Display time in the play HUD

- Extend the play HUD so the player can always see the current world time while in-game.
- Good first-pass display options:
  - a readable clock such as `Day 3  07:30`
  - or a Minecraft-like text such as `Day 3  Morning`
- Strong recommendation:
  - use the authoritative world time already replicated to the client
  - keep the display lightweight and text-only in the existing HUD style
  - avoid opening a dedicated debug overlay just for time
- The HUD clock should coexist cleanly with existing FPS, position, status, chat, gamemode, and inventory UI.

### Keep storage and protocol boundaries explicit

- This plan affects persistent world state and shared protocol shapes, so those boundaries should be named directly.
- Recommended additions:
  - world save metadata for authoritative time
  - join/update payload fields for world time
  - chunk payload or meshing inputs extended with replicated light-level data
  - block/item metadata extended with emissive-light information for `glowstone`
- Strong recommendation:
  - keep daylight/time helpers in shared code if both server and client need the same math
  - version chunk storage so saved light-level data can evolve safely
  - support a deterministic relight/rebuild path for old saves that predate lighting data
  - keep persistent storage formats versionable so lighting/time additions do not silently corrupt older saves

### Keep the first lighting pass intentionally scoped

- The first implementation should deliver:
  - authoritative time progression
  - a moving sun/daylight response
  - sunlight-aware chunk lighting
  - `glowstone` as the first emissive block with block-light propagation
  - `/timeset`
  - HUD time display
- Explicitly out of scope for this plan unless a small hook is unavoidable:
  - torches and other new emissive block families beyond `glowstone`
  - moon/stars/weather/clouds
  - sleeping/time-skip mechanics
  - hostile-mob night behavior
  - colored lighting
  - full biome-dependent fog/atmosphere systems

## Important Files

- `plans/0029-lighting-sun-daylight-cycle-and-time-display.md`
- `README.md`
- `architecture.md`
- `packages/core/src/shared/messages.ts`
- `packages/core/src/shared/*` for shared day/night or lighting math helpers
- `packages/core/src/types.ts`
- `packages/core/src/server/runtime.ts`
- `packages/core/src/server/world-session-controller.ts`
- `packages/core/src/server/authoritative-world.ts`
- `packages/core/src/server/*lighting*.ts` for the dedicated world lighting system
- `packages/core/src/server/world-storage.ts`
- `packages/core/src/server/world-tick.ts`
- `packages/core/src/world/chunk.ts`
- `packages/core/src/world/blocks.ts`
- `packages/core/src/world/items.ts`
- `packages/core/src/world/terrain.ts`
- `packages/core/src/world/*` for light storage, propagation, and meshing integration
- `apps/client/assets/textures/*` if atlas content needs a glowstone tile
- `apps/client/src/client/world-runtime.ts`
- `apps/client/src/game-app.ts`
- `apps/client/src/render/renderer.ts`
- `apps/client/src/ui/hud.ts`
- `tests/authoritative-world.test.ts`
- `tests/client-server.test.ts`
- `tests/storage.test.ts`
- `tests/hud.test.ts`
- `tests/*` for lighting helpers, meshing, and chunk-update coverage

## Test Plan

- Time helper tests:
  - shared day-progress helpers return stable daylight intensity and sun direction for representative times
  - named `/timeset` presets map to the expected canonical tick values
- Authoritative world/runtime tests:
  - authoritative time advances on server ticks at the intended rate
  - `/timeset` updates world time immediately and emits confirmation feedback
  - join payloads include the current authoritative world time
  - world reload restores persisted time correctly
  - chunk reload restores persisted light levels without forcing a full relight in the common case
- Lighting-system ownership tests:
  - the dedicated lighting system owns time progression and relight queue processing for one world
  - block mutations and `/timeset` feed the lighting system through explicit world/system boundaries instead of renderer-side logic
- Lighting propagation tests:
  - server-side light-level propagation produces expected `0..15` values for representative layouts
  - open sky columns receive full sunlight
  - covered underground spaces darken appropriately
  - placed `glowstone` emits light with the expected falloff
  - removing `glowstone` removes the propagated block light correctly
  - breaking or placing blocks near skylight paths updates lighting deterministically
  - chunk-edge relighting behaves consistently across neighboring chunks
- Meshing/render-data tests:
  - chunk mesh/light data changes when lighting changes affect visible faces
  - nearby `glowstone` changes face lighting on surrounding visible terrain
  - terrain shading responds to light levels without breaking opaque/cutout separation
- Content/inventory tests:
  - `glowstone` exists in block/item registries with an explicit emitted-light level
  - placed `glowstone` round-trips through block placement and drop mapping correctly
- Client/runtime/HUD tests:
  - replicated world time updates the client runtime
  - HUD clock renders the expected text for representative day/time values
  - time display remains visible alongside chat, inventory, and status UI
- Manual smoke tests:
  - join a world at dawn/day/night and confirm the environment brightness reads correctly
  - run `/timeset day`, `/timeset sunset`, and `/timeset night` and confirm the sky, terrain, and HUD update coherently
  - dig underground and confirm enclosed spaces are darker than exposed terrain
  - place `glowstone` underground and confirm it illuminates nearby terrain and caves
  - break/place blocks to open or close skylight shafts and confirm relighting updates nearby terrain
  - verify both local worker and dedicated server sessions stay aligned on world time

## Assumptions And Defaults

- Use the next plan filename in sequence: `0029-lighting-sun-daylight-cycle-and-time-display.md`.
- The authoritative day length should default to a Minecraft-like `24000` ticks.
- Server-owned time progression should run on the shared authoritative tick loop rather than on the client render loop.
- The first pass should prioritize sunlight/daylight and clean storage/protocol boundaries over advanced atmosphere or emissive block features.
- `glowstone` is the only new emissive block required for this milestone; broader utility-light content can come later.
- Persisting computed chunk light levels is the recommended default; on-load recomputation should be reserved for save-version upgrades and recovery paths.
- Clients may smooth visual transitions between replicated time updates, but authoritative time and `/timeset` remain server-owned.
