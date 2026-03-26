# Full Inventory And Stack Management

## Summary

Expand the current nine-slot hotbar into a fuller Minecraft-style inventory system with a dedicated inventory screen, a larger per-player storage grid, and proper stack behavior. The current project already has server-authoritative item counts, selected hotbar slot state, and HUD rendering, so this plan focuses on replacing the hotbar-only model with a fuller inventory snapshot that still keeps placement, collection, and persistence authoritative.

## Key Changes

### Expand the inventory model beyond the hotbar

- Replace the current fixed nine-slot inventory shape with a fuller player inventory layout.
- Recommended first pass:
  - keep the existing nine-slot hotbar
  - add a main inventory grid behind it
  - keep armor, offhand, and crafting slots out of scope unless we intentionally expand the plan later
- Strong recommendation:
  - inventory snapshot should explicitly distinguish between:
    - hotbar slots
    - main inventory slots
    - selected hotbar slot
- Avoid encoding “full inventory” as just a longer flat array if that makes UI layout and future features harder to reason about.

### Introduce proper stack semantics

- The current inventory logic is effectively “one block id per slot with a count.”
- Keep that basic shape, but formalize stack behavior:
  - each slot may be empty
  - each occupied slot stores item id plus count
  - items have a max stack size
- Recommended first pass:
  - keep one universal max stack size for placeable block items
  - later features can introduce per-item stack limits
- Stack rules should cover at minimum:
  - merging identical items into partially filled stacks
  - splitting a stack into an empty slot
  - moving a full stack between slots
  - swapping incompatible occupied slots
  - clamping invalid counts during normalization and load

### Add authoritative inventory interaction actions

- Inventory rearrangement must stay server-authoritative like block mutation and hotbar selection already are.
- Extend the shared protocol with explicit inventory interaction messages instead of mutating client-side only state.
- Likely actions:
  - pick up or place a stack with a virtual cursor item
  - move a whole stack between two slots
  - split a stack
  - quick-transfer between hotbar and main inventory if we want shift-click later
- Recommended first pass:
  - support left-click full-stack pickup/place/swap
  - support right-click split/place-one if feasible
  - defer shift-click, double-click gather, and drag painting unless implementation stays clean

### Add an inventory screen and input mode

- Introduce a proper in-game inventory UI, likely toggled with `E`.
- While the inventory screen is open:
  - show the full inventory grid and hotbar
  - allow pointer-driven slot interaction
  - pause or suppress gameplay actions like block break/place
  - keep chat and menu input flows separate from inventory input
- The app state should track:
  - whether inventory is open
  - hovered slot if needed
  - any client-visible cursor stack snapshot mirrored from authoritative state
- Keep screen ownership in `GameApp`, similar to chat-open state, not in the renderer.

### Rework the inventory snapshot and storage format

- Update `InventorySnapshot` so it can express the larger inventory cleanly.
- If we introduce empty slots, slot typing should allow “no item” explicitly rather than relying on sentinel block ids.
- Persistence must round-trip:
  - hotbar contents
  - main inventory contents
  - selected hotbar slot
  - any future-compatible fields without breaking existing saves
- Older saves with only the current hotbar should normalize safely into the new fuller layout.
- Recommended compatibility behavior:
  - preserve known hotbar contents
  - initialize new main-inventory slots as empty
  - clamp invalid counts and slot selections

### Keep world interactions using the selected hotbar slot

- Placing blocks should still use the selected hotbar slot, even once a larger inventory exists.
- Breaking collectible blocks should add items into the full inventory using normal stacking rules:
  - fill partial stacks first
  - then use empty slots
  - fail gracefully if inventory is full
- Decide early how “inventory full” behaves:
  - recommended first pass: reject the pickup/add and emit a user-visible status message
  - later, dropped item entities can absorb overflow behavior

### Update HUD and visual presentation

- Keep the bottom-center hotbar visible during normal play.
- Add a full inventory panel UI when inventory is open.
- The inventory screen should show:
  - main inventory grid
  - hotbar row
  - selected slot highlight
  - item counts
  - cursor-held stack if using pickup/place interactions
- Reuse the current lightweight UI/rect/text overlay system rather than introducing a separate retained UI framework.

### Define inventory utility logic centrally

- Move stack merge, split, swap, add-item, remove-item, and normalization behavior into shared inventory helpers.
- Keep these rules centralized in `src/world/inventory.ts` or a closely related module so:
  - server logic stays simple
  - tests can target inventory semantics directly
  - future chest/crafting/container features can reuse the same slot logic

### Leave room for future container and crafting systems

- This plan should prepare for:
  - chests
  - crafting grids
  - furnace slots
  - armor/offhand slots
- The inventory model should not paint us into a hotbar-only or player-only corner.
- A good first step is to make inventory actions operate over named slot groups or inventory sections rather than hard-coded assumptions everywhere.

## Important Files

- `plans/0015-full-inventory-and-stack-management.md`
- `README.md`
- `src/types.ts`
- `src/shared/messages.ts`
- `src/world/inventory.ts`
- `src/server/authoritative-world.ts`
- `src/server/runtime.ts`
- `src/server/world-storage.ts`
- `src/client/world-runtime.ts`
- `src/game-app.ts`
- `src/platform/native.ts`
- `src/ui/hud.ts`
- `src/ui/components.ts`
- `src/ui/renderer.ts`
- `tests/inventory.test.ts`
- `tests/client-server.test.ts`
- `tests/storage.test.ts`
- `tests/hud.test.ts`

## Test Plan

- Inventory logic tests:
  - default full inventory creates the expected hotbar and main inventory slot counts
  - normalization upgrades old hotbar-only snapshots into the new layout
  - add-item fills partial stacks before empty slots
  - add-item fails cleanly when inventory is full
  - move, swap, merge, and split rules behave correctly
- Client/server tests:
  - opening inventory does not mutate authoritative state by itself
  - moving stacks between slots replicates correctly through the server
  - selected hotbar slot still drives block placement
  - collecting a block inserts into the first valid stack/slot in the full inventory
- Storage tests:
  - larger inventories persist and reload correctly
  - old persisted snapshots still load without crashing and retain known counts
- UI/HUD tests:
  - hotbar still renders during normal play
  - inventory screen renders the main grid and hotbar layout when open
  - cursor-held stack or selected drag state renders correctly if implemented
- Manual smoke tests:
  - press `E` to open and close inventory
  - move stacks between hotbar and main inventory
  - split a stack and recombine it
  - fill inventory, then confirm overflow feedback is clear
  - place blocks from the selected hotbar slot after rearranging items

## Assumptions And Defaults

- Use the next plan filename in sequence: `0015-full-inventory-and-stack-management.md`.
- The first pass targets a player inventory plus hotbar, not armor, offhand, or crafting result slots.
- Inventory interactions stay server-authoritative even in single-player.
- The hotbar remains the active placement bar during normal gameplay.
- Overflow handling can start as “inventory full” feedback; dropped item entities can come later.
