# First-Person Hand Polish

## Summary

The current first-person hand looks bad: it uses a sand block texture for the
arm, is too large, sits at an unnatural angle, always renders at maximum
brightness regardless of the environment, and lacks the proportioned
Minecraft-style corner placement that makes a viewmodel feel grounded. This plan
fixes all of that without introducing a full animation framework.

## Problems To Fix

### Wrong texture on the arm

The arm/hand cuboid samples the sand block texture (`BLOCK_IDS.sand`). It needs
a dedicated skin-tone texture tile added to the voxel atlas so the arm looks
like a player arm instead of a sand block.

### Bad proportions and placement

The arm is too wide and too centred. A Minecraft-style hand sits in the
lower-right corner at a visible tilt so it reads clearly as an arm receding into
the screen. Current constants put it roughly centred with minimal inward tilt,
which is why it looks pasted on. The size and offset constants in
`player-model.ts` need to be tuned to:

- Thinner cross-section (roughly 0.14 × 0.14 wide/deep, 0.60 tall)
- Pushed further right and down so only the lower-right corner is visible
- Tilted inward (positive roll on the arm mesh so the face angle points slightly
  toward the camera) to give the receding-perspective feel

### No separate viewmodel projection

The hand currently renders in the same world-space projection as terrain, with
depth test disabled as a workaround. This causes it to scale with world FOV,
making it look enormous at wider FOV settings and causing the size to jump when
FOV is changed in settings. The fix is to render the viewmodel with a fixed
narrower FOV (e.g. 70°) independent of the world FOV, the standard approach for
FPS viewmodels. This requires building a second projection matrix during the
viewmodel pass.

### Flat max-brightness lighting

The hand always draws at full brightness because the sky/block light values
passed to the voxel shader are hardcoded to max. It should sample the light level
at the player's current block position so the hand dims appropriately in caves,
under overhangs, and at night.

### Held item floats disconnected from the hand

The held item uses separate position and rotation offsets that don't visually
attach it to the hand. The offsets need to be tuned so the item appears to be
gripped at the top of the visible arm segment rather than floating nearby.

### No movement bob

There is a swing animation but no idle or movement bob. A subtle vertical bob
tied to horizontal movement speed makes the hand feel alive and grounded.

## Key Changes

### Add an arm skin tile to the atlas

- Add a new `arm` tile to the source tile set (a simple skin-tone flat colour, or
  a small hand/arm texture consistent with the blocky art style).
- Register it in the content registry as a non-placeable internal block ID
  (`PLAYER_ARM_BLOCK_ID`), replacing the current sand fallback.
- Re-run atlas generation (`bun run build:native` or the atlas preprocessing
  step) so the tile appears in `voxel-atlas.png`.

### Tune proportions and corner placement

In `player-model.ts`:

- Reduce `FIRST_PERSON_ARM_PART.size` to approximately `[0.14, 0.60, 0.14]`.
- Adjust the position offsets in `player-renderer.ts` so the arm is anchored in
  the lower-right corner: increase the right offset, increase the downward
  offset, and pull slightly closer (reduce the forward offset).
- Add a roll component to the arm's model matrix so the arm face tilts inward
  ~25–35°, giving the receding-perspective look.

### Render the viewmodel with a fixed FOV

- In `renderer.ts`, before the viewmodel draw call, compute a secondary
  projection matrix using a fixed FOV (70° recommended) instead of the world
  camera FOV.
- Pass this alternate projection to the voxel shader uniform for the viewmodel
  pass only, then restore the world projection for the next frame.
- Keep near/far planes tight for the viewmodel (near ~0.01, far ~5.0) to avoid
  z-fighting with nearby geometry.

### Sample environment lighting at the player position

- In `player-renderer.ts`, read the sky light and block light at the player's
  foot or eye block from `ClientWorldRuntime` (the same chunk/lighting data
  already used for chunk meshing).
- Pass those values as the `aSkyLight` and `aBlockLight` vertex attributes when
  building the arm and held-item mesh each frame, replacing the current hardcoded
  max values.
- The existing daylight-aware brightness formula in the fragment shader then
  handles dimming automatically.

### Attach the held item to the arm

- Revise the held-item position and rotation offsets in `player-renderer.ts` so
  the item renders at the top of the visible arm, as if gripped.
- A good reference: held item should sit slightly left of arm centre, at arm-top
  height, and share nearly the same yaw/pitch tilt as the arm rather than having
  an independent rotation.

### Add a movement bob

- In `player-renderer.ts`, track horizontal movement speed each frame (derive
  from the local player's velocity or position delta).
- Compute a bob phase that advances while the player is moving:
  `bobPhase += movementSpeed * dt * bobFrequency`
- Apply a small vertical sine offset to the arm and held-item position:
  `bobOffset = sin(bobPhase) * bobAmplitude` where amplitude is ~0.012.
- Keep bob amplitude small enough that it is not nauseating. It should be barely
  perceptible but present.
- Blend bob offset smoothly to zero when the player stops moving.

## Important Files

- `plans/0040-first-person-hand-polish.md`
- `apps/client/src/render/player-renderer.ts` — position, rotation, lighting
- `apps/client/src/render/player-model.ts` — geometry size and offset constants
- `apps/client/src/render/renderer.ts` — viewmodel projection and draw order
- `apps/client/assets/shaders/voxel.vert` / `voxel.frag` — lighting uniforms
- `apps/client/assets/textures/tiles/` — source tiles for atlas
- `packages/core/src/world/content-registry.ts` — arm block ID registration
- `packages/core/src/world/item-render.ts` — face geometry helpers

## Out Of Scope

- Left-hand rendering
- Tool-specific animations (mining swing, eating, etc.)
- Offhand slot
- Player skin customisation
- Shadow casting from the viewmodel

## Test Plan

- Manual smoke tests:
  - Hand is visibly skin-toned and no longer looks like a sand block
  - Hand sits in the lower-right corner at a natural inward tilt
  - Changing FOV in settings does not change the apparent hand size
  - Walking causes a subtle vertical bob; stopping smoothly ends the bob
  - Entering a dark cave causes the hand to dim with the environment
  - Night cycle dims the hand consistently with the world lighting
  - Held item visually attaches to the top of the arm, not floating nearby
  - Swing animation still plays correctly on break/place
- Regression:
  - Remote player arm appearance unchanged (shares the same arm block ID but
    renders through the world-space player pass, not the viewmodel pass)
  - FOV slider still affects world geometry FOV as expected
  - No z-fighting between hand and near-clipped world geometry
