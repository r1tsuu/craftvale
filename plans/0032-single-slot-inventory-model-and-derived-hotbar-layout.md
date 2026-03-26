# Single-Slot Inventory Model And Derived Hotbar Layout

## Summary

Refactor Craftvale inventory state so the authoritative/domain model stores one ordered list of inventory slots instead of separately storing `hotbar` and `main` arrays. The current shape works for the present UI, but it bakes one particular screen layout into persistence, networking, gameplay helpers, and tests. That makes the inventory model feel more like a UI snapshot than a gameplay state model.

This plan replaces the split layout with one canonical slot array plus a selected slot index and cursor stack. Hotbar and main-inventory presentation become derived views calculated from that slot list. This is intentionally not backward compatible with the current stored player-inventory format; the save/network/storage model should be simplified around the new structure directly instead of carrying old layout assumptions forward.

## Key Changes

### Replace split inventory arrays with one canonical slot list

- Change `InventorySnapshot` from:
  - `hotbar: InventorySlot[]`
  - `main: InventorySlot[]`
  - `selectedSlot`
  - `cursor`
- To:
  - `slots: InventorySlot[]`
  - `selectedSlot`
  - `cursor`
- The slot order becomes the canonical inventory identity.
- Strong recommendation:
  - keep slot ordering stable and explicit
  - reserve the first `HOTBAR_SLOT_COUNT` slots for the hotbar view
  - derive all other visual groupings from slot ranges

### Treat hotbar and main as UI/layout concepts only

- The gameplay model should not store `hotbar` and `main` separately.
- Add helpers that derive:
  - hotbar slots from `slots.slice(0, HOTBAR_SLOT_COUNT)`
  - main inventory slots from the remaining visible inventory range
- Important discipline:
  - rendering and HUD code can think in terms of hotbar/main sections
  - server state, storage, and transport should think in terms of one slot array

### Simplify inventory interaction payloads to absolute slot indices

- Replace section-based inventory interactions such as:
  - `{ section: "hotbar", slot: 8 }`
  - `{ section: "main", slot: 2 }`
- With one absolute slot index payload such as:
  - `{ slot: 8 }`
  - `{ slot: HOTBAR_SLOT_COUNT + 2 }`
- This removes layout assumptions from the wire format and authoritative tick queue.

### Update inventory helpers around absolute slot indices

- Refactor inventory operations in `packages/core/src/world/inventory.ts` to work on one slot array:
  - normalization
  - slot lookup
  - drag/drop interaction
  - selected-slot helpers
  - stack merging
  - empty-slot search
- Add small helpers for visual callers where useful, for example:
  - `getHotbarInventorySlots`
  - `getMainInventorySlots`
  - `getMainInventorySlotIndex`

### Simplify save format around the new model

- Since this change is intentionally not backward compatible, update player inventory persistence directly instead of supporting both shapes.
- Good first-pass storage shape:
  - one slot-count field
  - one contiguous slot list
  - selected slot
  - cursor stack
- Strong recommendation:
  - bump the player save version explicitly
  - fail fast on the old version instead of silently trying to interpret it

### Keep selected-slot gameplay behavior intact

- Selected-slot semantics should stay the same:
  - selected index still points at one hotbar-visible slot
  - held-item rendering still uses the selected slot
  - placement/removal still uses the selected slot
- This plan changes data ownership, not gameplay rules.

### Reduce UI coupling in tests and helpers

- Many tests currently assert directly against `inventory.hotbar[...]` or `inventory.main[...]`.
- Update them to assert against:
  - derived layout helpers
  - or the canonical `slots` array plus absolute indices
- This should make future layout changes easier.

## Important Files

- `plans/0032-single-slot-inventory-model-and-derived-hotbar-layout.md`
- `README.md`
- `architecture.md`
- `packages/core/src/types.ts`
- `packages/core/src/world/inventory.ts`
- `packages/core/src/shared/messages.ts`
- `packages/core/src/server/player-system.ts`
- `packages/core/src/server/authoritative-world.ts`
- `packages/core/src/server/world-session-controller.ts`
- `packages/core/src/server/world-tick.ts`
- `packages/core/src/server/world-storage.ts`
- `apps/client/src/game-app.ts`
- `apps/client/src/ui/hud.ts`
- `apps/client/src/render/player-model.ts`
- `tests/inventory.test.ts`
- `tests/storage.test.ts`
- `tests/client-server.test.ts`
- `tests/authoritative-world.test.ts`
- `tests/hud.test.ts`
- `tests/player-render.test.ts`

## Suggested Implementation Order

1. Change `InventorySnapshot` to one `slots` array and add derived layout helpers.
2. Refactor inventory operations in `packages/core/src/world/inventory.ts` to use absolute slot indices only.
3. Update shared message payloads and queued gameplay intents to address inventory slots by absolute index.
4. Update authoritative/server/client callers to consume the new helpers.
5. Bump player inventory persistence format and rewrite encode/decode around one slot list.
6. Update HUD/tests to derive hotbar/main presentation from the canonical slot array.
7. Refresh docs so the architecture describes one canonical slot list instead of two stored sections.

## Test Plan

- Inventory tests:
  - default inventory still exposes the intended hotbar contents and starter items via derived helpers
  - interaction and stack merge behavior still works with absolute slot indices
  - selected slot still clamps to the hotbar-visible range
- Integration tests:
  - client/server inventory replication still behaves the same from the player's perspective
  - block placement and removal still consume the selected slot correctly
  - persisted players round-trip using the new inventory format
- Manual smoke tests:
  - open inventory, move a stack between hotbar and main area
  - select hotbar slots with number keys
  - place and pick up blocks and confirm counts update correctly

## Assumptions And Defaults

- Use the next plan filename in sequence: `0032-single-slot-inventory-model-and-derived-hotbar-layout.md`.
- The first `HOTBAR_SLOT_COUNT` entries of `slots` remain the hotbar-visible range.
- This refactor is intentionally not backward compatible with existing persisted inventory data.
- The goal is a cleaner domain model and wire format, not a UI redesign.
