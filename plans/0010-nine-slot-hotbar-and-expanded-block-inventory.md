# Nine-Slot Hotbar And Expanded Block Inventory

## Summary
Expand the current block inventory from its small starter hotbar into a fuller Minecraft-style nine-slot hotbar. The project already has a server-authoritative inventory model, hotbar selection input, and HUD text rendering, so this plan is specifically about increasing the available item types to nine, keeping those counts authoritative, and making the HUD/hotbar presentation feel intentional instead of cramped debug text.

## Key Changes

### Expand the block catalog to support nine placeable inventory item types
- Increase the set of collectible/placeable inventory-backed block types so the hotbar can represent nine distinct entries.
- This likely requires adding several new block ids beyond the current set and updating:
  - shared `BlockId` typing
  - block metadata
  - atlas tile definitions
  - atlas generation art/layout
- Each new hotbar item should have:
  - a stable block id
  - texture atlas coverage
  - placement behavior
  - collection/inventory behavior if breakable/collectible

### Expand the hotbar model from 5 slots to 9 slots
- Update the authoritative hotbar block-id list in `src/world/inventory.ts` from the current small set to nine entries.
- Keep the server-authoritative inventory snapshot model intact:
  - fixed slot order
  - selected slot index
  - per-slot counts
- Preserve clamping and normalization behavior for invalid slot indexes and stale persisted snapshots.

### Default inventory population
- New worlds should start with a full starter stack of each of the nine hotbar item types, matching the current “one stack per slot” behavior.
- Persisted worlds with older inventory snapshots should normalize safely:
  - old known counts are preserved when possible
  - newly added hotbar block types are filled in deterministically
- Decide whether backward compatibility should default missing new block types to:
  - zero
  - or the starter stack size
- Recommended default:
  - existing persisted worlds keep known counts and receive zero for newly introduced types
  - newly created worlds receive starter stacks in all nine slots

### Input and selection
- Preserve the existing number-key slot-selection flow exposed by the native input layer.
- Ensure selection works cleanly across slots `1` through `9`.
- Confirm the input path from native platform code through client runtime to server inventory selection already handles the full nine-slot range or extend it where needed.

### HUD/hotbar presentation
- Replace or improve the current text-only hotbar line so nine slots remain readable.
- Preferred direction:
  - a dedicated bottom-center hotbar strip
  - one visual slot per item type
  - selected-slot highlight
  - item label or count presentation that stays legible at nine slots
- At minimum, the HUD should stop feeling like a debug string once nine items are present.
- Keep the render path lightweight and compatible with the current UI/text/rect overlay system.

### World interaction behavior
- Placement should continue using the selected slot’s block id.
- Breaking collectible blocks should continue awarding the corresponding authoritative inventory count.
- Invalid placement should not consume counts.
- If some of the newly added blocks are decorative or biome-specific, ensure they still participate correctly in:
  - meshing
  - culling
  - collisions/solidity
  - inventory collection rules

### Atlas and rendering updates
- Add the required atlas tiles for the newly introduced block types.
- Update generated texture assets and any tests that assume the current tile count/layout.
- If any new blocks use cutout rendering, ensure they integrate with the existing opaque/cutout split.

### Storage and compatibility
- Validate that inventory persistence continues to round-trip with the larger slot list.
- Older saved worlds should not break when loaded after the slot expansion.
- Normalization should guard against:
  - too few slots
  - removed/unknown block ids
  - invalid selected-slot values

## Important Files
- `src/types.ts`
- `src/world/blocks.ts`
- `src/world/atlas.ts`
- `src/world/inventory.ts`
- `src/server/world-storage.ts`
- `src/server/authoritative-world.ts`
- `src/game-app.ts`
- `src/platform/native.ts`
- `src/render/*`
- `src/ui/*`
- `apps/cli/src/generate-voxel-atlas.ts`

## Test Plan
- Inventory tests:
  - default inventory contains nine slots
  - normalization preserves known counts and clamps selection safely
  - persisted old snapshots still load without crashing
- Client/server tests:
  - selecting slots `0..8` updates authoritative inventory selection
  - break/place still increments and decrements the expected block count
- Atlas/mesher tests:
  - all new block ids resolve to valid atlas tiles
  - new block face behavior matches the intended render mode
- UI/HUD tests:
  - hotbar rendering remains readable with nine slots
  - selected slot highlight updates correctly
- Manual smoke test:
  - launch the game
  - verify keys `1` through `9` select all slots
  - place each block type
  - verify counts update and the selected slot is visually obvious

## Assumptions And Defaults
- This plan extends the existing server-authoritative inventory/hotbar system rather than replacing it.
- The intended target is a Minecraft-style nine-slot hotbar, not a full backpack/crafting UI yet.
- Some new block types may need simple placeholder textures first; visual polish can follow after the slot expansion is stable.
- Use the next plan filename in sequence: `0010-nine-slot-hotbar-and-expanded-block-inventory.md`.
