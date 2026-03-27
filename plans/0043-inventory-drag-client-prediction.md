# Inventory Drag Client-Side Prediction

## Summary

Moving items in the inventory feels sluggish because every slot interaction requires a full
server round-trip before the UI updates. The player clicks a slot, waits for the server to
process `interactInventorySlot`, broadcast `inventoryUpdated`, and for the client to apply it
— only then does the item appear on the cursor or land in the target slot.

The fix is **client-side prediction**: when the player clicks a slot the client immediately
applies `interactInventorySlot` locally and shows the result. The server still processes the
action authoritatively; when its response arrives the client reconciles. Because
`interactInventorySlot` is already a deterministic pure function in
`packages/core/src/world/inventory.ts`, the predicted result almost always matches the server
result exactly.

## Problem

### No Prediction Today

`PlayController.handlePlayHudAction` (play-controller.ts:371-388) converts an inventory-slot
action into an `interactInventorySlot` event and sends it to the server. It makes no local
state change. The client's `worldRuntime.inventory` is only updated in `game-app.ts` when
`inventoryUpdated` is received from the server (game-app.ts:310-315).

On a local server this round-trip is fast but still adds one network tick of latency. On any
networked session the latency is clearly perceptible, making dragging feel unresponsive.

### Current Interaction Model

The inventory uses a two-click drag model: click slot A to pick the item up onto the cursor,
then click slot B to place it. The cursor item already renders at the mouse position every
frame (hud.ts:592-605). The visual tracking is instant; the only delay is the server
acknowledgement between picks and places.

## Proposed Change

### Predicted Inventory State

Add a nullable `predictedInventory: InventorySnapshot | null` field to `PlayController`
alongside the existing `worldRuntime.inventory` (the authoritative state). While a prediction
is in-flight, the HUD and cursor render from the predicted snapshot instead of the
authoritative one.

```ts
// play-controller.ts
private predictedInventory: InventorySnapshot | null = null

private getDisplayInventory(): InventorySnapshot {
  return this.predictedInventory ?? this.deps.getWorldRuntime().inventory
}
```

### Predict on Click

In `handlePlayHudAction`, before sending the event to the server, apply
`interactInventorySlot` to the current display inventory and store the result as
`predictedInventory`:

```ts
import { interactInventorySlot } from '@craftvale/core'

// inside handlePlayHudAction, after resolving slot number:
const current = this.getDisplayInventory()
this.predictedInventory = interactInventorySlot(current, resolvedSlot)

this.deps.getClientAdapter().eventBus.send({
  type: 'interactInventorySlot',
  payload: { slot: resolvedSlot },
})
```

### Reconcile on Server Ack

When the server's `inventoryUpdated` event arrives the authoritative state is already correct.
Clear `predictedInventory` so the display falls back to the authoritative snapshot. If they
matched, nothing visible changes. If they diverged (rare edge case, e.g. concurrent change or
slot overflow), the UI snaps to the authoritative state silently.

```ts
// in game-app.ts inventoryUpdated handler, after applyInventory:
playController.clearPrediction()
```

`clearPrediction()` simply sets `predictedInventory = null`.

### HUD Uses Display Inventory

Pass `getDisplayInventory()` to `buildPlayHud` / `buildInventoryOverlay` instead of
`worldRuntime.inventory` directly. No changes needed inside `hud.ts`.

## Important Files

- `apps/client/src/app/play-controller.ts` — add `predictedInventory` field, `getDisplayInventory()`, `clearPrediction()`; predict in `handlePlayHudAction`
- `apps/client/src/app/game-app.ts` — call `playController.clearPrediction()` after `applyInventory` in `inventoryUpdated` handler
- `apps/client/src/ui/hud.ts` — no changes required; receives inventory as argument
- `packages/core/src/world/inventory.ts` — no changes; `interactInventorySlot` is already exported and pure

## Out of Scope

- Right-click / split-stack interactions (not yet implemented)
- Drag-spread across multiple slots while holding mouse button (future feature)
- Rollback animation if prediction diverges from server state

## Verification

1. `bun run typecheck` — no errors
2. `bun test` — all tests pass
3. Manual: open inventory, click a slot with an item — item appears on cursor immediately with no perceptible delay
4. Manual: click again to place — item moves to target slot immediately
5. Manual: on a networked session, confirm dragging feels responsive and eventual server ack does not cause any visible stutter or double-update
