# Block Breaking Progress

## Summary

Block breaking is currently instant: a single left-click removes a block unconditionally. The
goal is Minecraft-style charged breaking — the player must hold the left mouse button for a
block-specific duration before the block is removed. While the player is holding, the focused
block visually darkens (the highlight outline shifts from white toward red) to show progress.
Each block type exposes a `durability` value (milliseconds). Setting it to `0` preserves the
old instant-break behavior.

## Proposed Change

### 1. Block `durability` field

Add `durability: number` (milliseconds of continuous hold required) to `AuthoredBlockSpec` in
`packages/core/src/world/content-spec.ts` and to `BlockDefinition` in
`packages/core/src/world/blocks.ts`. The content pipeline already propagates all spec fields
through the generator; no generator changes are needed beyond the new field.

Representative defaults:

| Block      | Durability (ms) |
| ---------- | --------------- |
| air        | 0               |
| grass      | 600             |
| dirt       | 600             |
| sand       | 600             |
| gravel     | 700             |
| wood/log   | 900             |
| stone      | 1500            |
| cobblestone| 1500            |
| ore blocks | 2000            |
| bedrock    | 0 (unbreakable) |

`durability: 0` means the block breaks on the first tick the button is held (or pressed), which
matches the current instant-remove behavior. Bedrock already has `breakable: false` so it is
never removed regardless.

Export a helper `getBlockDurability(blockId: BlockId): number` from
`packages/core/src/world/blocks.ts` alongside the existing helpers.

### 2. Client-side break state in `PlayController`

Add a private `breakState` field to `PlayController`:

```ts
// apps/client/src/app/play-controller.ts
private breakState: {
  x: number
  y: number
  z: number
  elapsed: number   // ms of continuous hold on this block
} | null = null
```

Replace the current edge-triggered break logic (`if (hit && input.breakBlockPressed)`) with a
hold-based loop that runs every fixed tick. `FIXED_STEP_MS` is already available as the tick
delta.

```ts
// inside the fixed-step gameplay update, after raycasting
const FIXED_STEP_MS = /* existing constant */ 50

if (hit && input.breakBlock && !isGameplaySuppressed(...)) {
  const { x, y, z } = hit.hit
  if (
    this.breakState === null ||
    this.breakState.x !== x ||
    this.breakState.y !== y ||
    this.breakState.z !== z
  ) {
    // New target — reset accumulator
    this.breakState = { x, y, z, elapsed: 0 }
  } else {
    this.breakState.elapsed += FIXED_STEP_MS
  }

  const blockId = worldRuntime.world.getBlock(x, y, z)
  const durability = getBlockDurability(blockId)
  const progress = durability === 0 ? 1 : Math.min(this.breakState.elapsed / durability, 1)

  if (progress >= 1) {
    const localGamemode = worldRuntime.getClientPlayer()?.gamemode ?? this.deps.player.gamemode
    worldRuntime.applyPredictedBreak(x, y, z, localGamemode)
    adapter.eventBus.send({
      type: 'mutateBlock',
      payload: { x, y, z, blockId: BLOCK_IDS.air },
    })
    this.breakState = null
  }
  // else: still accumulating — expose progress for rendering
} else {
  this.breakState = null
}
```

Expose the current progress (0–1) for the renderer by including it in `PlayTickResult`:

```ts
export interface PlayTickResult {
  focusedBlock: Vec3 | null
  breakProgress: number   // 0 = no progress, 1 = breaking (shown only when < 1 and > 0)
  overlayText: TextDrawCommand[]
  uiComponents: UiResolvedComponent[]
  remainingAccumulator: number
}
```

### 3. Visual feedback — highlight color shift

Pass `breakProgress` down to `FocusHighlightRenderer.render()` so the outline color shifts
from white → amber → red as progress increases.

```ts
// apps/client/src/render/highlight.ts
public render(block: Vec3 | null, breakProgress: number, viewProjection: Float32Array): void
```

In `highlight-mesh.ts`, replace the constant `HIGHLIGHT_COLOR` with a function that
interpolates based on progress:

```ts
const getHighlightColor = (progress: number): [number, number, number] => {
  // 0 → white (0.97, 0.97, 0.97)
  // 0.5 → amber (1.0, 0.65, 0.1)
  // 1.0 → red (1.0, 0.15, 0.1)
  if (progress <= 0) return [0.97, 0.97, 0.97]
  if (progress <= 0.5) {
    const t = progress / 0.5
    return [0.97 + 0.03 * t, 0.97 - 0.32 * t, 0.97 - 0.87 * t]
  }
  const t = (progress - 0.5) / 0.5
  return [1.0, 0.65 - 0.5 * t, 0.1]
}
```

All eight vertices of the highlight cube use the same interpolated color. No shader or VAO
changes are required.

### 4. Creative mode — always instant

Creative mode (`gamemode === 1`) should keep the instant feel. Detect this in the break logic
and treat durability as `0` regardless of the block spec:

```ts
const localGamemode = worldRuntime.getClientPlayer()?.gamemode ?? this.deps.player.gamemode
const effectiveDurability = localGamemode === 1 ? 0 : durability
```

This mirrors Minecraft's behaviour where creative players always one-shot blocks.

### 5. Server — no changes required

The server already receives `mutateBlock` with `blockId: air` and applies the authoritative
removal. It does not need to know about break duration — durability is a client-side pacing
mechanism (the same way Minecraft clients gate the break event). The server still validates
that the targeted block is breakable before applying the mutation.

## Content-spec updates

Edit every block entry in `AUTHORED_BLOCK_SPECS` in `content-spec.ts` to add a `durability`
field. Representative values follow the table above. After editing content-spec, run
`bun run generate:content` and review the diff in `generated/`.

## Important Files

| File | Change |
| ---- | ------ |
| `packages/core/src/world/content-spec.ts` | Add `durability: number` to `AuthoredBlockSpec`; fill values for all blocks |
| `packages/core/src/world/blocks.ts` | Add `durability` to `BlockDefinition`; export `getBlockDurability()` |
| `packages/core/src/world/generated/content-registry.ts` | Re-generated — do not hand-edit |
| `apps/client/src/app/play-controller.ts` | Replace press-edge break with hold-progress loop; add `breakState`; add `breakProgress` to `PlayTickResult` |
| `apps/client/src/app/game-app.ts` | Pass `breakProgress` from tick result to renderer |
| `apps/client/src/render/highlight.ts` | Add `breakProgress` parameter to `render()` |
| `apps/client/src/render/highlight-mesh.ts` | Replace constant color with progress-interpolated color |
| `apps/client/src/render/renderer.ts` | Forward `breakProgress` to `focusHighlightRenderer.render()` |
| `apps/client/src/game/break-state.ts` | New file — pure `advanceBreakState` / `getBreakProgress` helpers |
| `tests/highlight.test.ts` | Extend with progress color-interpolation assertions |
| `tests/blocks.test.ts` | New file — `getBlockDurability` unit tests |
| `tests/break-state.test.ts` | New file — pure break-state machine unit tests |

## Tests

### `tests/highlight.test.ts` — extend existing

The existing test checks mesh dimensions. Extend it to cover the new progress-based color
interpolation once `buildFocusHighlightMesh` accepts `breakProgress`:

```ts
test('focus highlight mesh is white at zero break progress', () => {
  const mesh = buildFocusHighlightMesh({ x: 0, y: 0, z: 0 }, 0)
  // color components are at offsets 3,4,5 of each vertex (stride=6)
  expect(mesh.vertexData[3]).toBeCloseTo(0.97)
  expect(mesh.vertexData[4]).toBeCloseTo(0.97)
  expect(mesh.vertexData[5]).toBeCloseTo(0.97)
})

test('focus highlight mesh shifts toward red at full break progress', () => {
  const mesh = buildFocusHighlightMesh({ x: 0, y: 0, z: 0 }, 1)
  expect(mesh.vertexData[3]).toBeCloseTo(1.0)
  expect(mesh.vertexData[4]).toBeCloseTo(0.15)
  expect(mesh.vertexData[5]).toBeCloseTo(0.1)
})

test('focus highlight mesh is amber at 50% break progress', () => {
  const mesh = buildFocusHighlightMesh({ x: 0, y: 0, z: 0 }, 0.5)
  expect(mesh.vertexData[3]).toBeGreaterThan(0.97)
  expect(mesh.vertexData[4]).toBeCloseTo(0.65)
})
```

### `tests/blocks.test.ts` — new file

A focused test for `getBlockDurability`:

```ts
test('getBlockDurability returns 0 for air', () => {
  expect(getBlockDurability(BLOCK_IDS.air)).toBe(0)
})

test('getBlockDurability returns a positive value for breakable blocks', () => {
  expect(getBlockDurability(BLOCK_IDS.grass)).toBeGreaterThan(0)
  expect(getBlockDurability(BLOCK_IDS.stone)).toBeGreaterThan(0)
})

test('breakable blocks have higher durability than soft blocks', () => {
  expect(getBlockDurability(BLOCK_IDS.stone)).toBeGreaterThan(getBlockDurability(BLOCK_IDS.dirt))
})
```

### Pure `advanceBreakState` helper — extract and test

To make the break-state accumulation testable without mocking `PlayController`'s many
dependencies, extract the state machine into a small pure function (e.g. in a new
`apps/client/src/game/break-state.ts`):

```ts
export interface BreakState {
  x: number
  y: number
  z: number
  elapsed: number
}

export const advanceBreakState = (
  current: BreakState | null,
  target: { x: number; y: number; z: number } | null,
  deltaMs: number,
): BreakState | null => { ... }

export const getBreakProgress = (state: BreakState, durability: number): number =>
  durability === 0 ? 1 : Math.min(state.elapsed / durability, 1)
```

Tests in `tests/break-state.test.ts`:

```ts
test('initialises fresh state when there is no current state', () => {
  const next = advanceBreakState(null, { x: 1, y: 2, z: 3 }, 50)
  expect(next).toEqual({ x: 1, y: 2, z: 3, elapsed: 50 })
})

test('accumulates elapsed time on the same target', () => {
  const s0 = advanceBreakState(null, { x: 1, y: 2, z: 3 }, 50)
  const s1 = advanceBreakState(s0, { x: 1, y: 2, z: 3 }, 50)
  expect(s1?.elapsed).toBe(100)
})

test('resets when target block changes', () => {
  const s0 = advanceBreakState(null, { x: 1, y: 2, z: 3 }, 200)
  const s1 = advanceBreakState(s0, { x: 5, y: 2, z: 3 }, 50)
  expect(s1).toEqual({ x: 5, y: 2, z: 3, elapsed: 50 })
})

test('returns null when target is null (mouse released)', () => {
  const s0 = advanceBreakState(null, { x: 1, y: 2, z: 3 }, 200)
  expect(advanceBreakState(s0, null, 50)).toBeNull()
})

test('getBreakProgress clamps to 1 when elapsed exceeds durability', () => {
  const state: BreakState = { x: 0, y: 0, z: 0, elapsed: 999 }
  expect(getBreakProgress(state, 500)).toBe(1)
})

test('getBreakProgress returns 1 immediately for zero durability', () => {
  const state: BreakState = { x: 0, y: 0, z: 0, elapsed: 0 }
  expect(getBreakProgress(state, 0)).toBe(1)
})
```

## Out of Scope

- Crack overlay textures (Minecraft's animated crack sprite). The color-shift outline is the
  visual signal for this plan; a texture-based crack pass can be a future follow-up.
- Tool-speed modifiers (different tools breaking blocks faster). Durability is a flat block
  property for now.
- Server-authoritative break validation beyond the existing breakable check.
- Networked progress replication to other players.

## Verification

1. `bun run generate:content` — runs cleanly, `content-id-lock.json` unchanged (new field
   does not affect ids), `content-registry.ts` updated with `durability` values.
2. `bun run typecheck` — no errors.
3. `bun test` — all tests pass.
4. Manual: hold left mouse on a grass block — outline shifts from white to red over ~600 ms,
   then block breaks and drops.
5. Manual: `durability: 0` block (if any) breaks immediately on first hold frame.
6. Manual: release mouse before progress completes — progress resets, outline returns to white
   when re-targeting.
7. Manual: move crosshair to a different block mid-break — progress resets on the new target.
8. Manual: creative mode — all blocks break instantly regardless of `durability`.
