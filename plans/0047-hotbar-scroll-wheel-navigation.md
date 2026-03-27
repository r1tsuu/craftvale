# Hotbar Scroll Wheel Navigation

## Summary

Allow the player to cycle through hotbar slots with the mouse scroll wheel as an
alternative to pressing digit keys 1–9. Scrolling up moves the selection one slot to
the left; scrolling down moves it one slot to the right, with wrap-around at either end.

## Goals

- Mouse scroll wheel cycles hotbar selection in both directions, wrapping at slot 0 and
  slot 8.
- Digit keys 1–9 continue to work exactly as before.
- Scroll input is accumulated correctly across the fixed-step input pipeline so no ticks
  are lost on a fast scroll.

## Non-Goals

- Scroll sensitivity or inversion settings (single-step-per-notch is sufficient).
- Scroll input affecting anything outside the hotbar (zoom, block menus, etc.).
- Any UI or HUD changes beyond what the existing slot-selection highlight already does.

## Key Changes

### 1. Native scroll callback (`native/bridge.c`)

Register a GLFW scroll callback that accumulates vertical scroll delta into a global
integer counter. Expose two new bridge functions:

```c
static int g_scroll_y = 0;

static void scroll_callback(GLFWwindow *window, double xoffset, double yoffset) {
  (void)window;
  (void)xoffset;
  g_scroll_y += (int)yoffset;
}

// Register in bridge_init_window:
glfwSetScrollCallback(g_window, scroll_callback);

// New exports:
int bridge_consume_scroll_y(void) {
  int v = g_scroll_y;
  g_scroll_y = 0;
  return v;
}
```

`bridge_consume_scroll_y` drains the accumulated delta each frame so no scroll events
are silently lost.

### 2. FFI symbol declaration (`apps/client/src/platform/native.ts`)

Add the new symbol alongside the existing bridge declarations:

```ts
bridge_consume_scroll_y: { args: [], returns: 'int32_t' },
```

Read it inside `pollInput()` and expose it through `InputState`:

```ts
const scrollDelta = library.symbols.bridge_consume_scroll_y() as number
```

### 3. `InputState` extension (`apps/client/src/types.ts`)

Add one field:

```ts
hotbarScrollDelta: number   // raw scroll notches this frame; positive = down, negative = up
```

`hotbarScrollDelta` is signed: positive means scroll-down (slot index increases),
negative means scroll-up (slot index decreases).

### 4. Fixed-step input pipeline (`apps/client/src/game/fixed-step-input.ts`)

`PendingFixedStepInputEdges` needs to accumulate scroll deltas rather than overwrite:

```ts
export interface PendingFixedStepInputEdges {
  breakBlockPressed: boolean
  placeBlockPressed: boolean
  hotbarSelection: number | null
  hotbarScrollDelta: number          // added
}

export const emptyPendingFixedStepInputEdges = (): PendingFixedStepInputEdges => ({
  breakBlockPressed: false,
  placeBlockPressed: false,
  hotbarSelection: null,
  hotbarScrollDelta: 0,              // added
})

export const queueFixedStepInputEdges = (
  pending: PendingFixedStepInputEdges,
  input: Pick<InputState, 'breakBlockPressed' | 'placeBlockPressed' | 'hotbarSelection' | 'hotbarScrollDelta'>,
): PendingFixedStepInputEdges => ({
  breakBlockPressed: pending.breakBlockPressed || input.breakBlockPressed,
  placeBlockPressed: pending.placeBlockPressed || input.placeBlockPressed,
  hotbarSelection: input.hotbarSelection ?? pending.hotbarSelection,
  hotbarScrollDelta: pending.hotbarScrollDelta + input.hotbarScrollDelta,  // accumulate
})

export const applyFixedStepInputEdges = (
  input: InputState,
  pending: PendingFixedStepInputEdges,
): InputState => ({
  ...input,
  breakBlockPressed: pending.breakBlockPressed || input.breakBlockPressed,
  placeBlockPressed: pending.placeBlockPressed || input.placeBlockPressed,
  hotbarSelection: pending.hotbarSelection ?? input.hotbarSelection,
  hotbarScrollDelta: pending.hotbarScrollDelta + input.hotbarScrollDelta,  // accumulate
})
```

Accumulation ensures that fast scrolls across multiple render frames are not silently
dropped before the next fixed game tick.

### 5. Hotbar resolution (`apps/client/src/app/play-controller.ts`)

In `updateGame`, resolve scroll delta into an absolute slot after handling direct key
presses. Read the current selected slot from the world runtime, apply the clamped delta,
wrap modulo 9, and emit `selectInventorySlot`:

```ts
// Existing keyboard selection (unchanged):
if (input.hotbarSelection !== null) {
  adapter.eventBus.send({ type: 'selectInventorySlot', payload: { slot: input.hotbarSelection } })
}

// New scroll wheel selection:
if (input.hotbarScrollDelta !== 0) {
  const HOTBAR_SIZE = 9
  const currentSlot = getSelectedInventorySlotIndex(worldRuntime.inventory)
  const steps = Math.sign(input.hotbarScrollDelta)  // one step per tick regardless of fast scroll
  const nextSlot = ((currentSlot + steps) % HOTBAR_SIZE + HOTBAR_SIZE) % HOTBAR_SIZE
  adapter.eventBus.send({ type: 'selectInventorySlot', payload: { slot: nextSlot } })
}
```

Using `Math.sign` ensures the selection moves one slot at a time per tick even if
multiple scroll notches were buffered, keeping navigation predictable.

---

## Important Files

| File | Change |
| ---- | ------ |
| `native/bridge.c` | Add scroll callback, `g_scroll_y` global, `bridge_consume_scroll_y` export |
| `apps/client/src/platform/native.ts` | Declare `bridge_consume_scroll_y` symbol; read it in `pollInput` |
| `apps/client/src/types.ts` | Add `hotbarScrollDelta: number` to `InputState` |
| `apps/client/src/game/fixed-step-input.ts` | Add `hotbarScrollDelta` to `PendingFixedStepInputEdges`; accumulate in queue and apply functions |
| `apps/client/src/app/play-controller.ts` | Resolve `hotbarScrollDelta` into `selectInventorySlot` event after existing digit-key handling |

No content-spec, atlas, inventory model, or server-side changes are required.

## Suggested Implementation Order

1. Add `g_scroll_y`, `scroll_callback`, and `bridge_consume_scroll_y` to `native/bridge.c`.
2. Run `bun run build:native` to rebuild the dylib.
3. Add the FFI symbol declaration and `scrollDelta` read in `native.ts`; add
   `hotbarScrollDelta` to the returned `InputState` object.
4. Add `hotbarScrollDelta: number` to `InputState` in `types.ts`.
5. Update `PendingFixedStepInputEdges`, `emptyPendingFixedStepInputEdges`,
   `queueFixedStepInputEdges`, and `applyFixedStepInputEdges` in `fixed-step-input.ts`.
6. Add scroll resolution logic in `play-controller.ts`.
7. Run `bun run typecheck` and `bun test`.
8. Manual smoke test: scroll wheel cycles slots; digit keys still jump directly.

## Verification

1. `bun run build:native` — dylib rebuilds with no errors.
2. `bun run typecheck` — no errors.
3. `bun test` — all tests pass.
4. Manual: scroll down cycles 0→1→2…→8→0; scroll up cycles in reverse.
5. Manual: pressing digit 3 while scrolling does not lose the key-press selection.
6. Manual: fast multi-notch scroll moves one slot per tick, staying predictable.
