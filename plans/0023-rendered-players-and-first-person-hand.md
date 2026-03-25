# Rendered Players And First-Person Hand

## Summary
Add visible player rendering so multiplayer sessions show other players in the world, and add a first-person embodiment path for the local player. The first pass should stay disciplined: render players as simple blocky character models driven by replicated player snapshots, let the same player-model work inform the first-person result where practical, and only introduce a separate hand/viewmodel path if the shared player-body approach proves too awkward for clipping or readability.

## Key Changes

### Add an explicit player-rendering pass
- Extend the renderer so players are treated as dynamic replicated actors, similar in spirit to dropped items, not as part of chunk meshes.
- Recommended draw order:
  - opaque terrain
  - opaque dropped items
  - opaque player bodies
  - cutout terrain
  - cutout dropped items
  - cutout player parts if needed later
  - focused-block highlight
  - first-person hand/viewmodel
  - text and UI
- Keep player rendering separate from terrain meshing so player pose updates do not rebuild chunk meshes.

### Render remote players from replicated snapshots
- Use the existing replicated `PlayerSnapshot` data in `ClientWorldRuntime.players` as the source of truth for remote player render state.
- First-pass remote player model should stay simple and Minecraft-like:
  - blocky cuboid silhouette
  - head
  - torso
  - arms/legs represented with cuboid parts
- Strong recommendation:
  - keep the geometry clearly Minecraft-inspired rather than smooth or humanoid in a realistic way
  - fragmentation can be simplified in the first pass
  - for example, we do not need perfect six-part articulation if a smaller set of cuboid segments gives a clean result
  - reasonable first-pass options:
    - head + torso + one combined arm pair + one combined leg pair
    - head + torso + four limb cuboids if that still stays simple
  - build reusable cuboid meshes and simple transforms rather than a dense character mesh
  - keep texture sampling on the shared voxel atlas for now instead of introducing a separate skin system
- The local camera should not drive remote players. They should render only from authoritative replicated state.

### Decide how the local first-person body should be reused
- We should not assume up front that the local player needs a fully separate FPS hand renderer.
- Since this plan already adds a renderable player body, the first pass should evaluate whether first-person embodiment can reuse that same model work.
- Recommended default:
  - remote players render as full world-space bodies
  - the local player does not render the full body exactly like a remote player
  - but the local first-person arm/held-item presentation should try to reuse the same mesh pieces, atlas rules, and pose logic where possible
- This keeps us from maintaining two unrelated character-render implementations too early.

### Add a first-person arm and held-item presentation
- The local player still needs visible first-person embodiment.
- First pass options should be explicitly ordered:
  - preferred: reuse the player arm/held-item geometry and pose rules, but render only the visible first-person-relevant subset
  - fallback: add a dedicated camera-space hand/viewmodel path if reusing the player body causes clipping or readability issues
- Good first-pass scope:
  - one visible right arm
  - optional held block/item representation using the currently selected hotbar stack
  - no left hand yet unless it becomes important for inventory/interaction readability
- The important goal is not “a separate renderer at all costs”; it is a clean first-person result with minimal duplication.

### Reuse existing inventory selection for the held item
- The first-person hand should reflect the currently selected hotbar slot.
- Good first-pass rule:
  - if the selected slot contains a placeable block stack, render a held block/item model with the hand
  - if the slot is empty, render only the hand
- This should read from the already authoritative inventory snapshot on the client side instead of inventing a separate local-only held-item state.

### Use simple animation and pose rules first
- Avoid jumping straight into a full animation system.
- Recommended first-pass player/body pose rules:
  - yaw rotates the whole player body
  - pitch tilts the head only, or head plus hand where useful
  - simplified limbs can use a lightweight walk swing derived from horizontal movement delta between recent snapshots
  - idle pose is stable and readable
- Recommended first-pass hand animation:
  - subtle bob/sway from local movement
  - optional short swing on break/place input if it is easy to keep client-side
- If exact authoritative animation state is not available yet, keep animation cosmetic and client-side.

### Decide the minimum replicated pose data deliberately
- The current `PlayerSnapshot` already carries position, yaw, and pitch, which may be enough for a first pass.
- Before adding new protocol fields, confirm whether these are sufficient for:
  - body yaw
  - head pitch
  - simple remote-player pose
- Strong recommendation:
  - do not add networked limb animation state in v1
  - only extend the snapshot/message schema if a missing field blocks a clean render

### Add a small player-render model boundary
- Create an explicit player-render helper or renderer rather than growing `VoxelRenderer` monolithically.
- Reasonable shapes:
  - `PlayerRenderer` for shared body-part meshes, pose logic, and world-space drawing
  - optional `HeldItemRenderer` or local-arm helper only if the reused body-part path is not clean enough on its own
- `VoxelRenderer` can orchestrate these passes while keeping terrain and actor rendering responsibilities separated.

### Preserve visibility and readability rules
- Remote players should be culled by distance using the same general active/render distance logic as other dynamic actors.
- The first-person arm/held-item path should:
  - remain visually stable across FOV changes
  - avoid covering the crosshair too aggressively
  - only use special depth/projection handling if the reused body-part approach actually needs it
- Good default:
  - start from the simplest reused-geometry approach
  - add a later dedicated overlay-style hand pass only if world-space or shared-model reuse proves unsatisfying

### Leave skins and advanced animation out of scope
- The first pass should not attempt:
  - custom player skins
  - armor layers
  - offhand rendering
  - tool-specific animation trees
  - emotes
  - full-body local shadow/self model
- It is acceptable for the first pass to use fewer articulated parts than the classic Minecraft player model as long as the silhouette still reads as cube-based and Minecraft-like.
- The goal is readable presence and FPS embodiment first, not a full character pipeline.

### Add tests around pose/model decisions where practical
- Rendering itself is hard to snapshot-test here, so prefer tests around:
  - player render filtering (local player excluded from world-space pass)
  - held-item selection derivation from inventory
  - body-part transform helpers
  - simple animation math staying stable and bounded
- Manual smoke tests remain important for:
  - remote player visibility
  - local hand placement
  - near-block clipping behavior
  - held-item switching across hotbar slots

## Important Files
- `plans/0023-rendered-players-and-first-person-hand.md`
- `README.md`
- `architecture.md`
- `src/game-app.ts`
- `src/client/world-runtime.ts`
- `src/render/renderer.ts`
- `src/render/*` for player/body/viewmodel helpers
- `src/types.ts`
- `src/world/inventory.ts`
- `tests/*` for render-helper, player-state, and held-item selection coverage

## Test Plan
- Render-data tests:
  - remote-player render collection excludes the local player entity
  - remote players inside render distance are included
  - remote players outside render distance are skipped
- Held-item tests:
  - selected hotbar block produces a held-item render descriptor
  - empty selected slot renders hand-only state
  - inventory updates change the derived held item cleanly
- Pose/helper tests:
  - body/head transforms respond correctly to yaw and pitch
  - simple walk-swing math stays bounded and deterministic
  - first-person hand offset logic stays stable across representative FOV values
- Manual smoke tests:
  - join two clients and confirm they can see each other moving
  - verify the local client does not render its own full body in first person
  - switch hotbar slots and confirm the held item updates immediately
  - stand near walls/blocks and confirm the hand remains readable without severe clipping

## Assumptions And Defaults
- Use the next plan filename in sequence: `0023-rendered-players-and-first-person-hand.md`.
- The first pass targets visible remote players plus a local first-person arm/held-item presentation, not a full character customization system.
- Existing replicated `PlayerSnapshot` data should be considered sufficient until a concrete rendering need proves otherwise.
- Local first-person embodiment should prefer reusing the same player-model pieces and pose rules before introducing a wholly separate hand pipeline.
- Player meshes should remain separate from chunk meshes and terrain generation concerns.
