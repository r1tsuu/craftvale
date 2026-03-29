# Sprinting and Item Drop

## Summary

Two quality-of-life gameplay additions:

1. **Sprinting** — double-tapping W starts a sprint that boosts walk speed. Releasing W
   stops the sprint.
2. **Item drop** — pressing Q drops one item from the active hotbar slot; holding Q for
   a short threshold drops the entire stack.

---

## Goals

- Double-tap W (both taps within the existing `DOUBLE_TAP_WINDOW_SECONDS = 0.32 s`)
  starts sprinting at `SPRINT_SPEED = 6.18` (≈ 1.3 × `MOVE_SPEED`).
- Releasing W while sprinting immediately cancels the sprint.
- Sprinting has no effect in creative flight mode (flying overrides movement speed already).
- Pressing Q while holding an item drops exactly 1 from the active slot.
- Holding Q for `DROP_STACK_THRESHOLD_SECONDS = 0.4 s` drops the remaining stack (after
  the initial single-drop) and resets the hold timer so a second hold-Q does nothing on
  an empty slot.
- Dropped items are ejected forward from the player's eye position using the player's yaw
  (horizontal aim direction), matching the existing `spawnBlockDrop` trajectory style but
  directed rather than pseudo-random.

## Non-Goals

- HUD sprint indicator or FOV zoom during sprint.
- Exhaustion / hunger system gating sprint.
- Ctrl+Q shortcut (drop whole stack without the hold).
- Drop animation or item throw arc.
- Any change to flying or creative-mode speed.

---

## Key Changes

### 1. Sprinting — `apps/client/src/game/player.ts`

Add three new private fields to `PlayerController`:

```ts
private previousForwardDown = false
private timeSinceForwardPress = Number.POSITIVE_INFINITY
private sprinting = false
```

Add a constant alongside the existing ones:

```ts
const SPRINT_SPEED = 6.18 // MOVE_SPEED * 1.3
```

In `update()`, after the jump / flying block and before computing horizontal movement,
detect double-tap W and manage sprint state:

```ts
// Sprint double-tap detection (survival mode only, not flying)
if (!this.flying) {
  this.timeSinceForwardPress += deltaSeconds
  const forwardPressed = input.moveForward && !this.previousForwardDown
  if (forwardPressed) {
    if (this.timeSinceForwardPress <= DOUBLE_TAP_WINDOW_SECONDS) {
      this.sprinting = true
    }
    this.timeSinceForwardPress = 0
  }
  if (!input.moveForward) {
    this.sprinting = false
  }
  this.previousForwardDown = input.moveForward
}
```

Apply sprint multiplier when computing horizontal displacement:

```ts
const speed = this.sprinting ? SPRINT_SPEED : MOVE_SPEED
// replace the two existing MOVE_SPEED references in the axis moves:
position = this.moveAxis(world, position, 'x', normalized.x * speed * deltaSeconds)
position = this.moveAxis(world, position, 'z', normalized.z * speed * deltaSeconds)
```

Sprinting is fully client-side — the server receives position updates via `updatePlayerState`
as before and needs no changes.

---

### 2. Drop-item input — `apps/client/src/platform/native.ts`

Add the missing GLFW key constant (Q = 81):

```ts
const GLFW_KEY_Q = 81
```

Add two new fields to the `InputState` object returned from `pollInput()`:

```ts
dropItemPressed: Boolean(library.symbols.bridge_consume_key_press(GLFW_KEY_Q)),
dropItemHeld:    Boolean(library.symbols.bridge_is_key_down(GLFW_KEY_Q)),
```

`dropItemPressed` fires exactly once per key-down event (consume); `dropItemHeld` mirrors
the held state every frame, allowing the hold-threshold logic to accumulate time.

---

### 3. `InputState` extension — `apps/client/src/types.ts`

```ts
dropItemPressed: boolean
dropItemHeld: boolean
```

---

### 4. Fixed-step input pipeline — `apps/client/src/game/fixed-step-input.ts`

`dropItemPressed` is edge-triggered (OR-accumulate like `breakBlockPressed`).
`dropItemHeld` is level-triggered (OR-accumulate so held state is visible to the tick).

```ts
export interface PendingFixedStepInputEdges {
  // ... existing fields ...
  dropItemPressed: boolean // added
  dropItemHeld: boolean // added
}

export const emptyPendingFixedStepInputEdges = (): PendingFixedStepInputEdges => ({
  // ... existing ...
  dropItemPressed: false,
  dropItemHeld: false,
})
```

Update `queueFixedStepInputEdges` and `applyFixedStepInputEdges` to OR both fields (same
pattern as `breakBlockPressed`).

---

### 5. New `dropItem` client event — `packages/core/src/shared/messages.ts`

Add to `ClientEventMap`:

```ts
dropItem: {
  slot: number
  count: number
}
```

Add `'dropItem'` to the codec list alongside `'mutateBlock'` and `'selectInventorySlot'`.

---

### 6. `QueuedGameplayIntent` — `packages/core/src/server/world-tick.ts`

Extend the union:

```ts
| {
    kind: 'dropItem'
    sequence: number
    playerEntityId: EntityId
    slot: number
    count: number
  }
```

---

### 7. Session controller — `packages/core/src/server/world-session-controller.ts`

Add an `eventBus.on('dropItem', ...)` handler (same shape as `selectInventorySlot`):

```ts
this.adapter.eventBus.on('dropItem', ({ slot, count }) => {
  this.queueGameplayIntent({
    kind: 'dropItem',
    playerEntityId: this.playerEntityId,
    slot,
    count,
  })
})
```

---

### 8. New drop method — `packages/core/src/server/dropped-item-system.ts`

Add `spawnPlayerDrop` next to `spawnBlockDrop`. Unlike the pseudo-random block-drop
velocity, the player drop is thrown forward using the player's yaw:

```ts
public async spawnPlayerDrop(
  itemId: ItemId,
  count: number,
  position: readonly [number, number, number],
  yaw: number,
): Promise<DroppedItemSimulationResult> {
  await this.ensureLoaded()
  const THROW_HORIZONTAL = 4.5
  const THROW_VERTICAL = 1.0
  const velocity: [number, number, number] = [
    Math.cos(yaw) * THROW_HORIZONTAL,
    THROW_VERTICAL,
    Math.sin(yaw) * THROW_VERTICAL,
  ]
  // Reuse createDroppedItem but override velocity after creation
  const entityId = this.entities.registry.createEntity('drop')
  const spawnPosition: [number, number, number] = [position[0], position[1], position[2]]
  this.entities.droppedItemTransform.set(entityId, { position: spawnPosition, velocity })
  this.entities.droppedItemStack.set(entityId, { itemId, count: Math.max(1, Math.trunc(count)) })
  this.entities.droppedItemLifecycle.set(entityId, { pickupCooldownMs: PICKUP_COOLDOWN_MS })
  this.addToChunkIndex(entityId, spawnPosition)
  const item = this.getSnapshot(entityId)
  this.saveDirty = true
  return { ...emptySimulationResult(), spawned: [item] }
}
```

> Note: the throw velocity constants can be tuned during manual testing; these initial
> values give a short forward arc similar to Minecraft's item throw.

---

### 9. Server intent handler — `packages/core/src/server/authoritative-world.ts`

Add a `dropItem` case to the intent switch alongside `selectInventorySlot`:

```ts
case 'dropItem': {
  const result = await this.dropPlayerItem(
    intent.playerEntityId,
    intent.slot,
    intent.count,
  )
  this.broadcastDroppedItemResults([result])
  break
}
```

Add a private helper `dropPlayerItem`:

```ts
private async dropPlayerItem(
  entityId: EntityId,
  slot: number,
  count: number,
): Promise<DroppedItemSimulationResult> {
  const inventory = await this.playerSystem.getInventory(entityId)
  const slotData = inventory.inventory.slots[slot]
  if (!slotData || slotData.count <= 0) return emptySimulationResult()

  const dropCount = Math.min(count, slotData.count)
  await this.playerSystem.removeFromSlot(entityId, slot, dropCount)
  const player = this.entities.playerMovement.require(entityId, 'player movement')  // for yaw
  const playerState = this.entities.playerTransform.require(entityId, 'player transform')
  const eyePosition: [number, number, number] = [
    playerState.position[0],
    playerState.position[1] + 1.62, // eye height
    playerState.position[2],
  ]
  return this.droppedItemSystem.spawnPlayerDrop(
    slotData.itemId,
    dropCount,
    eyePosition,
    playerState.yaw,
  )
}
```

> `removeFromSlot` is a new method on `PlayerSystem` (see below). Player transform
> component already stores `yaw`; verify the exact component/field name when implementing.

---

### 10. `PlayerSystem.removeFromSlot` — `packages/core/src/server/player-system.ts`

Add a focused helper that decrements a slot by `count` and emits `inventoryUpdated`:

```ts
public async removeFromSlot(
  entityId: EntityId,
  slot: number,
  count: number,
): Promise<InventorySnapshot> {
  const inventory = this.requireComponent(this.entities.playerInventory, entityId, 'player inventory')
  const next = removeInventorySlotCount(inventory.inventory, slot, count)
  this.entities.playerInventory.set(entityId, { inventory: next })
  return this.buildInventorySnapshot(entityId, next)
}
```

`removeInventorySlotCount` is a new helper in `packages/core/src/world/inventory.ts`:

```ts
export function removeInventorySlotCount(
  inventory: Inventory,
  slot: number,
  count: number,
): Inventory {
  const slots = inventory.slots.map((s, i) => {
    if (i !== slot) return s
    const remaining = s.count - count
    return remaining <= 0 ? { itemId: ITEM_IDS.none, count: 0 } : { ...s, count: remaining }
  })
  return { ...inventory, slots }
}
```

---

### 11. Drop logic in play-controller — `apps/client/src/app/play-controller.ts`

Add two new private fields:

```ts
private dropHeldSeconds = 0
private droppedStackThisTap = false
```

Add a constant:

```ts
const DROP_STACK_THRESHOLD_SECONDS = 0.4
```

In `updateGame()`, after hotbar selection logic:

```ts
// Item drop (Q)
if (input.dropItemHeld) {
  this.dropHeldSeconds += deltaSeconds
} else {
  this.dropHeldSeconds = 0
  this.droppedStackThisTap = false
}

const selectedSlot = worldRuntime.inventory.selectedSlot
const slotData = getSelectedInventorySlot(worldRuntime.inventory)

if (input.dropItemPressed && slotData.count > 0) {
  adapter.eventBus.send({ type: 'dropItem', payload: { slot: selectedSlot, count: 1 } })
}

if (
  input.dropItemHeld &&
  !this.droppedStackThisTap &&
  this.dropHeldSeconds >= DROP_STACK_THRESHOLD_SECONDS &&
  slotData.count > 1 // at least 1 left after the initial single drop
) {
  adapter.eventBus.send({
    type: 'dropItem',
    payload: { slot: selectedSlot, count: slotData.count - 1 },
  })
  this.droppedStackThisTap = true
}
```

The `droppedStackThisTap` flag prevents repeated full-stack drops while Q remains held
after the threshold.

---

## Important Files

| File                                                   | Change                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/client/src/game/player.ts`                       | `SPRINT_SPEED`, `previousForwardDown`, `timeSinceForwardPress`, `sprinting` fields; double-tap detection; speed branch in axis moves |
| `apps/client/src/platform/native.ts`                   | `GLFW_KEY_Q = 81`; `dropItemPressed` and `dropItemHeld` in `pollInput`                                                               |
| `apps/client/src/types.ts`                             | `dropItemPressed: boolean`, `dropItemHeld: boolean` added to `InputState`                                                            |
| `apps/client/src/game/fixed-step-input.ts`             | `dropItemPressed` and `dropItemHeld` in `PendingFixedStepInputEdges`; OR-accumulate in queue/apply                                   |
| `apps/client/src/app/play-controller.ts`               | `dropHeldSeconds`, `droppedStackThisTap`; Q-drop logic in `updateGame`                                                               |
| `packages/core/src/shared/messages.ts`                 | `dropItem` added to `ClientEventMap`; codec list updated                                                                             |
| `packages/core/src/server/world-tick.ts`               | `dropItem` variant added to `QueuedGameplayIntent`                                                                                   |
| `packages/core/src/server/world-session-controller.ts` | `eventBus.on('dropItem', ...)` handler                                                                                               |
| `packages/core/src/server/dropped-item-system.ts`      | `spawnPlayerDrop` method                                                                                                             |
| `packages/core/src/server/authoritative-world.ts`      | `dropItem` intent case; `dropPlayerItem` private helper                                                                              |
| `packages/core/src/server/player-system.ts`            | `removeFromSlot` method                                                                                                              |
| `packages/core/src/world/inventory.ts`                 | `removeInventorySlotCount` helper                                                                                                    |

No atlas, worldgen, meshing, or persistence changes are required.

---

## Suggested Implementation Order

### Sprinting

1. Add `SPRINT_SPEED`, `previousForwardDown`, `timeSinceForwardPress`, `sprinting` to
   `player.ts`.
2. Add double-tap W detection and speed branch in `update()`.
3. Run `bun run typecheck && bun test`.
4. Manual smoke: double-tap W → visible speed increase; release W → normal speed resumes.

### Item Drop

5. Add `GLFW_KEY_Q`, `dropItemPressed`, `dropItemHeld` to `native.ts`.
6. Add fields to `InputState` in `types.ts`.
7. Add `dropItemPressed` / `dropItemHeld` to `PendingFixedStepInputEdges`; update queue
   and apply functions in `fixed-step-input.ts`.
8. Add `dropItem` to `ClientEventMap` and codec list in `messages.ts`.
9. Add `dropItem` to `QueuedGameplayIntent` in `world-tick.ts`.
10. Add `removeInventorySlotCount` to `inventory.ts`.
11. Add `removeFromSlot` to `player-system.ts`.
12. Add `spawnPlayerDrop` to `dropped-item-system.ts`.
13. Add `dropItem` case and `dropPlayerItem` helper to `authoritative-world.ts`.
14. Add `eventBus.on('dropItem', ...)` to `world-session-controller.ts`.
15. Add `dropHeldSeconds`, `droppedStackThisTap`, and Q-drop logic to `play-controller.ts`.
16. Run `bun run typecheck && bun test`.
17. Manual smoke tests (see Verification below).

---

## Tests

### `tests/player.test.ts` — sprinting

```ts
test('double-tap W starts sprinting and moves faster than walking', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.state = { position: [2.5, 1, 2.5], yaw: 0, pitch: 0 }

  // Walk for one second — record distance
  const walker = new PlayerController()
  walker.state = { position: [2.5, 1, 2.5], yaw: 0, pitch: 0 }
  for (let step = 0; step < 60; step++) {
    walker.update(createInput({ moveForward: true }), 1 / 60, world)
  }
  const walkDistance = walker.state.position[0] - 2.5

  // Double-tap W to start sprint
  player.update(createInput({ moveForward: true }), 1 / 60, world)
  player.update(createInput({ moveForward: false }), 0.05, world) // brief release
  player.update(createInput({ moveForward: true }), 1 / 60, world) // second tap → sprint
  const startX = player.state.position[0]
  for (let step = 0; step < 57; step++) {
    player.update(createInput({ moveForward: true }), 1 / 60, world)
  }
  const sprintDistance = player.state.position[0] - startX + (startX - 2.5)

  expect(sprintDistance).toBeGreaterThan(walkDistance)
})

test('single W press does not start sprinting', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.state = { position: [2.5, 1, 2.5], yaw: 0, pitch: 0 }

  const walker = new PlayerController()
  walker.state = { position: [2.5, 1, 2.5], yaw: 0, pitch: 0 }

  for (let step = 0; step < 60; step++) {
    player.update(createInput({ moveForward: true }), 1 / 60, world)
    walker.update(createInput({ moveForward: true }), 1 / 60, world)
  }

  expect(player.state.position[0]).toBeCloseTo(walker.state.position[0], 3)
})

test('releasing W cancels sprint so next single tap walks at normal speed', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.state = { position: [2.5, 1, 2.5], yaw: 0, pitch: 0 }

  // Double-tap to engage sprint
  player.update(createInput({ moveForward: true }), 1 / 60, world)
  player.update(createInput({ moveForward: false }), 0.05, world)
  player.update(createInput({ moveForward: true }), 1 / 60, world)
  expect(player.sprinting).toBe(true)

  // Release W — sprint should cancel
  player.update(createInput({ moveForward: false }), 1 / 60, world)
  expect(player.sprinting).toBe(false)
})

test('W double-tap outside the window does not sprint', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.state = { position: [2.5, 1, 2.5], yaw: 0, pitch: 0 }

  player.update(createInput({ moveForward: true }), 1 / 60, world)
  player.update(createInput({ moveForward: false }), 0.4, world) // 0.4 s > 0.32 s window
  player.update(createInput({ moveForward: true }), 1 / 60, world)

  expect(player.sprinting).toBe(false)
})
```

> `sprinting` must be made `public` (or `public readonly`) on `PlayerController` to keep
> these tests free of movement-distance approximations where direct state inspection is
> cleaner.

---

### `tests/fixed-step-input.test.ts` — drop-item edges

```ts
test('dropItemPressed edge survives until the next simulation step', () => {
  const queued = queueFixedStepInputEdges(
    createPendingFixedStepInputEdges(),
    createInput({ dropItemPressed: true }),
  )
  const stepInput = applyFixedStepInputEdges(createInput(), queued)

  expect(queued.dropItemPressed).toBe(true)
  expect(stepInput.dropItemPressed).toBe(true)
})

test('dropItemHeld state accumulates across frames', () => {
  const queued = queueFixedStepInputEdges(
    queueFixedStepInputEdges(
      createPendingFixedStepInputEdges(),
      createInput({ dropItemHeld: false }),
    ),
    createInput({ dropItemHeld: true }),
  )

  expect(queued.dropItemHeld).toBe(true)
})

test('createPendingFixedStepInputEdges initialises drop fields to false', () => {
  const pending = createPendingFixedStepInputEdges()

  expect(pending.dropItemPressed).toBe(false)
  expect(pending.dropItemHeld).toBe(false)
})
```

> Update the existing snapshot-equality test (line 64 in the current file) to include
> `dropItemPressed: false` and `dropItemHeld: false` in the expected object.

---

### `tests/inventory.test.ts` — `removeInventorySlotCount`

```ts
test('removeInventorySlotCount decrements slot by the requested amount', () => {
  const inventory = createStarterInventory() // slot 0 = grass × 64
  const result = removeInventorySlotCount(inventory, 0, 10)

  expect(getHotbarInventorySlots(result)[0]).toEqual({ itemId: ITEM_IDS.grass, count: 54 })
})

test('removeInventorySlotCount zeroes slot when count equals stack size', () => {
  const inventory = createStarterInventory() // slot 0 = grass × 64
  const result = removeInventorySlotCount(inventory, 0, 64)

  expect(getHotbarInventorySlots(result)[0]).toEqual({ itemId: ITEM_IDS.empty, count: 0 })
})

test('removeInventorySlotCount zeroes slot when count exceeds available items', () => {
  const inventory = createStarterInventory() // slot 0 = grass × 64
  const result = removeInventorySlotCount(inventory, 0, 100)

  expect(getHotbarInventorySlots(result)[0]).toEqual({ itemId: ITEM_IDS.empty, count: 0 })
})

test('removeInventorySlotCount leaves other slots unchanged', () => {
  const inventory = createStarterInventory()
  const result = removeInventorySlotCount(inventory, 0, 5)
  const hotbar = getHotbarInventorySlots(result)

  // slot 1 onwards must be unchanged
  for (let i = 1; i < 9; i++) {
    expect(hotbar[i]).toEqual(getHotbarInventorySlots(inventory)[i])
  }
})
```

---

### `tests/authoritative-world.test.ts` — `dropItem` intent

```ts
test('dropItem intent removes items from inventory and spawns a dropped item', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-drop-item-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('DropItem', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)
    // Test inventory: hotbar[0] = grass × 64, selectedSlot = 0

    const result = await world.dropItem(joined.clientPlayer.entityId, 0, 1)

    expect(result.inventory.slots[0]).toEqual({ itemId: ITEM_IDS.grass, count: 63 })
    expect(result.droppedItems.spawned).toHaveLength(1)
    expect(result.droppedItems.spawned[0]?.itemId).toBe(ITEM_IDS.grass)
    expect(result.droppedItems.spawned[0]?.count).toBe(1)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('dropItem intent empties slot when count equals stack size', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-drop-stack-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('DropStack', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)

    const result = await world.dropItem(joined.clientPlayer.entityId, 0, 64)

    expect(result.inventory.slots[0]).toEqual({ itemId: ITEM_IDS.empty, count: 0 })
    expect(result.droppedItems.spawned).toHaveLength(1)
    expect(result.droppedItems.spawned[0]?.count).toBe(64)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('dropItem intent on an empty slot is a no-op', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-drop-empty-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('DropEmpty', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)
    // Test inventory: hotbar[6] is empty

    const result = await world.dropItem(joined.clientPlayer.entityId, 6, 1)

    expect(result.droppedItems.spawned).toHaveLength(0)
    expect(result.inventory.slots[6]).toEqual({ itemId: ITEM_IDS.empty, count: 0 })
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})
```

> `world.dropItem` must be made `public` on `AuthoritativeWorld` (or tested through a
> tick intent) to make these unit tests viable. The pattern follows
> `world.selectInventorySlot` and `world.interactInventorySlot` which are already public.

---

### `tests/message-codec.test.ts` — `dropItem` round-trip

```ts
test('transport codec round-trips dropItem client event', () => {
  const encoded = encodeTransportMessage({
    kind: 'event',
    type: 'dropItem',
    payload: { slot: 3, count: 12 },
  })

  const decoded = decodeClientToServerMessage(encoded)
  expect(decoded).toEqual({
    kind: 'event',
    type: 'dropItem',
    payload: { slot: 3, count: 12 },
  })
})
```

---

## Verification

1. `bun run typecheck` — no errors.
2. `bun test` — all tests pass, including the new cases above.
3. Manual — sprint:
   - Walk speed unchanged with single W tap.
   - Double-tap W (within 0.32 s) → visibly faster movement.
   - Releasing W stops sprint; next single W press walks at normal speed.
   - Sprint does not engage in creative flight mode.
4. Manual — item drop:
   - Tap Q → one item leaves the active hotbar slot and a dropped item entity appears on
     the ground in front of the player.
   - Hold Q → after 0.4 s, the remaining stack is ejected; slot becomes empty.
   - Hold Q on a slot with count = 1 → only the single item drops (no stack drop fires).
   - Holding Q on an empty slot → nothing happens.
   - Dropped items can be walked over and picked up normally.
