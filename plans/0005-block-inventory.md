# Block Inventory

## Summary
Add a simple block inventory so placing blocks consumes owned items instead of always spawning stone for free. The first pass should stay small and readable: the player can collect blocks by breaking them, select a placeable block type from a compact hotbar, and place only when they have stock available. Inventory state should remain authoritative on the server, replicate to the client for UI and input feedback, and persist with the world alongside existing chunk data.

## Key Changes

### Inventory model and scope
- Introduce a player inventory model keyed by `BlockId`.
- Start with stack counts only; durability, crafting, equipment, and containers are out of scope.
- Limit the first UI to placeable terrain/material blocks:
  - grass if allowed by design, or skip if grass should remain worldgen-only
  - dirt
  - stone
  - log
  - leaves
- Keep air non-inventory and non-selectable.
- Add a selected-slot or selected-block field so the player can choose what right-click places.

### Client gameplay flow
- Replace the hardcoded `blockId: 3` placement path in the game loop with the currently selected inventory block.
- Ignore place attempts when:
  - no placeable block is selected
  - the selected stack count is zero
- Add lightweight input for selection, such as:
  - number keys for hotbar slots
  - optional mouse wheel cycling if the native input layer already supports it cleanly
- Keep the current break/place interaction timing model; inventory does not require a new tool/action system in this pass.

### Server-authoritative inventory updates
- Treat inventory counts as server-owned gameplay state.
- Extend block mutation handling so the server:
  - grants block items when a player breaks a collectible block
  - decrements the selected block count when a placement succeeds
  - rejects placement if the player has no stock
- Keep break/place validation simple and consistent with current authority rules:
  - breaking air yields nothing
  - placing into non-air fails
  - failed placements do not consume inventory
- If certain generated blocks should not drop themselves exactly, make that policy explicit in code rather than implicit in UI.

### Messaging and replication
- Add shared DTOs for inventory replication and selection changes.
- Expected message/event additions:
  - client event or request to change selected inventory slot/block
  - server event carrying current inventory contents and selected slot/block
  - mutation result updates that can include both changed chunks and inventory deltas/snapshots
- Keep the replicated payload explicit and transport-safe:
  - selected slot or block
  - ordered slots or block-count pairs
  - maximum slot count if hotbar layout is fixed
- Prefer sending authoritative snapshots after meaningful changes over trying to optimize into tiny diffs too early.

### Persistence and world/session ownership
- Persist inventory as part of the active world session/player state so save/load preserves collected blocks.
- Fit this into the current single-player named-world model:
  - each world stores one inventory state for the local player
  - joining a world restores that inventory
  - creating a world initializes a default starter inventory policy
- Decide and document the default:
  - empty inventory except for optional starter blocks
  - or a small starter set so building is immediately possible

### UI and HUD
- Add a visible hotbar/inventory strip to the HUD.
- Show, at minimum:
  - selected block
  - count for each visible slot
  - a clear empty/zero-state presentation
- Keep it consistent with the repo’s current minimalist text/UI style unless a broader HUD redesign is desired later.
- Provide immediate feedback when placement fails because inventory is empty, for example through HUD text or existing server-status messaging.

### Inventory/block catalog boundaries
- Make placeability an explicit block capability instead of assuming every collidable block belongs in inventory.
- Recommended block-definition metadata additions:
  - collectible on break
  - placeable by player
  - inventory label/icon source if needed
- This keeps future decorative or special blocks from accidentally becoming inventory items just because they exist in `BlockId`.

### Runtime integration points
- Update the client runtime and app bootstrap to store replicated inventory state alongside chunk state.
- Update server runtime/session logic so join/create flows send initial inventory data in addition to spawn/world data.
- Keep chunk replication separate from inventory replication; they change for different reasons and should not become tightly coupled.

## Important Public Interfaces/Types
- Add inventory DTOs such as:
  - `InventorySlot`
  - `InventorySnapshot`
  - `PlayerInventoryState`
- Extend shared message maps with inventory selection and inventory-sync payloads.
- Extend block metadata with inventory-relevant behavior such as collectibility/placeability.
- Join-world/session payloads gain initial inventory state, or a paired inventory sync event is emitted immediately after join.

## Test Plan
- Inventory state tests:
  - breaking a collectible block increments the correct inventory count
  - successful placement decrements the selected stack count
  - failed placement leaves counts unchanged
  - non-inventory blocks cannot be selected/placed if excluded by policy
- Client/server tests:
  - joining a world delivers initial inventory state to the client
  - selection changes propagate correctly
  - authoritative inventory updates remain in sync after break/place actions
- Persistence tests:
  - inventory save/load round-trips with the world
  - switching or rejoining worlds restores the correct per-world inventory
- UI tests:
  - hotbar renders counts and highlights the selected slot
  - empty stacks show a clear zero-state
  - input changes the selected slot/block predictably
- Manual validation:
  - break blocks, collect them, switch slots, place them back
  - cannot place when the selected stack is empty
  - inventory remains correct after save/restart/rejoin

## Assumptions And Defaults
- This pass targets a single-player per-world inventory only; multiplayer player identities and shared containers are out of scope.
- Inventory remains server-authoritative even though the game is currently local-worker-backed.
- A compact hotbar is sufficient for v1; no full-screen inventory screen yet.
- Crafting, smelting, recipes, and tool gating are out of scope.
- Use the next plan filename in sequence: `0005-block-inventory.md`.
