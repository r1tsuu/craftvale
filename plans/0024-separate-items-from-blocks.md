# Separate Items From Blocks

## Summary
Separate inventory items from world blocks completely so gameplay no longer treats `BlockId` as the item identity. Blocks and items should become different registries with different responsibilities: blocks describe world voxels and terrain behavior, while items describe inventory stacks, dropped pickups, held-item rendering, and player interaction affordances. An item may still be related to a block, but that relationship must be explicit. For example, one item can place a block, a broken block can drop a related item, and picking up a dropped entity should always award an item stack rather than a raw block id.

## Key Changes

### Introduce an explicit item domain
- Add `ItemId` as a separate identity space from `BlockId`.
- Add `ItemDefinition` metadata alongside the existing block registry.
- Treat items as the source of truth for:
  - inventory slots and stack counts
  - dropped-item stack contents
  - selected hotbar entry
  - held-item and UI display labels
- Treat blocks as the source of truth for:
  - chunk voxel contents
  - collision and render pass behavior
  - world generation and terrain decoration
  - block mutation validation in the world

### Make block-item relationships explicit instead of implicit
- Remove the assumption that every collectible or placeable block is itself the inventory item.
- Recommended explicit block/item relationship fields:
  - block-side `dropItemId` or equivalent policy helper for break results
  - item-side `placesBlockId` or equivalent placement capability for placeable items
  - optional item-side `minedBlockId` or `relatedBlockId` only for UI/render convenience if it stays clearly non-authoritative
- This makes room for:
  - blocks that do not drop themselves
  - items that place a different block than their own display implies
  - non-placeable items that are still collectible and droppable
  - future items that are not blocks at all

### Move inventory and dropped stacks to item ids
- Replace block-based inventory slot contents with item-based slot contents.
- Replace dropped-item snapshots and server dropped-item state so they carry `itemId` and count.
- Remove block-specific helpers like `getSelectedInventoryBlockId` in favor of item-centric helpers such as a selected inventory item lookup.
- Keep stack rules centralized in inventory helpers, but make them item-based rather than block-based.

### Reframe placement as item behavior
- Right-click placement should first resolve the selected item, then ask whether that item places a block.
- If the selected item is placeable:
  - resolve the target `BlockId` from item metadata
  - run the existing authoritative block placement validation
  - consume one item on success
- If the selected item does not place a block:
  - the interaction should fail cleanly without mutating the world
- This keeps world mutation rules in the authoritative world while making placement originate from item capabilities.

### Reframe block breaking as block-to-item conversion
- Breaking a collectible block should no longer mean “grant the broken `BlockId`.”
- Instead:
  - the authoritative block rules determine whether the block is breakable/collectible
  - the block resolves its drop item policy
  - the server spawns a dropped item entity carrying `ItemId` and count
- Pickup then adds items to inventory through the existing authoritative item-stack path.
- This keeps block removal and item acquisition clearly separated.

### Simplify block metadata around world behavior
- Revisit block-definition flags like `collectible` and `placeable`, since they currently blur world and inventory semantics.
- Strong recommendation:
  - blocks retain world-side traits such as collision, render pass, and break/drop policy
  - items retain inventory-side traits such as max stack size, display name, icon source, and placement behavior
- If a block still needs a break/drop flag, it should be expressed in world terms, not as an inventory assumption.

### Add an item registry and rendering/display hooks
- Add an `items.ts` or equivalent registry module to own item definitions.
- Item definitions should be able to describe:
  - display name
  - stack size
  - held-item render style
  - dropped-item render style
  - optional related block/item presentation metadata
- First pass can still render many items using block-derived visuals where appropriate, but the lookup should start from the item definition rather than the block registry.

### Update UI and HUD to speak item language
- Hotbar, inventory grid, cursor stack, and selected-label UI should display item names and counts.
- For placeable block-items, the UI may still show block-derived visuals, but it should not rely on `BlockId`-shaped inventory data.
- Empty-slot logic should stay the same, but slot content and labels should come from item metadata.

### Update network and persistence payloads
- Shared protocol DTOs should move from `blockId`-carrying inventory/dropped-item payloads to `itemId`-carrying payloads.
- World persistence should store item stacks as item ids in:
  - player inventory state
  - dropped-item save data
- Backward compatibility is not required for this refactor:
  - old block-based inventory and dropped-item save data does not need to load
  - older protocol payload shapes do not need compatibility shims
  - we can replace the persisted/runtime formats directly as part of the migration

### Preserve first-pass behavior through explicit mappings
- To avoid a huge gameplay redesign in one step, the first item registry can stay close to the current block set:
  - most current placeable block types get corresponding placeable items
  - current dropped block loot maps one-to-one to matching item entries
- The important architectural change is not adding lots of new items immediately. It is enforcing that items are distinct from blocks even when they happen to map one-to-one at first.

### Leave room for non-block items next
- This separation should make later features straightforward:
  - tools
  - consumables
  - crafting ingredients
  - fuel items
  - utility items that interact without placing blocks
- The new architecture should avoid reintroducing block assumptions into those future features.

## Important Files
- `plans/0005-block-inventory.md`
- `plans/0020-dropped-item-entities-and-pickups.md`
- `plans/0024-separate-items-from-blocks.md`
- `README.md`
- `architecture.md`
- `src/types.ts`
- `src/shared/messages.ts`
- `src/world/blocks.ts`
- `src/world/items.ts` or equivalent new item-registry module
- `src/world/inventory.ts`
- `src/server/authoritative-world.ts`
- `src/server/player-system.ts`
- `src/server/dropped-item-system.ts`
- `src/server/world-storage.ts`
- `src/render/renderer.ts`
- `src/render/player-model.ts`
- `src/ui/hud.ts`
- `tests/inventory.test.ts`
- `tests/storage.test.ts`
- `tests/client-server.test.ts`

## Suggested Implementation Order
1. Introduce `ItemId`, item definitions, and item-based inventory/dropped-item DTOs without changing gameplay rules yet.
2. Migrate inventory helpers, hotbar selection, and persistence from `BlockId` stacks to `ItemId` stacks.
3. Migrate dropped-item state and pickup flow to `ItemId`.
4. Update placement to resolve `placesBlockId` from the selected item.
5. Update break/drop rules so broken blocks spawn explicit item drops.
6. Update rendering and HUD code to derive names and visuals from items, using block relationships only when item definitions say to.
7. Update docs to reflect the new data model and explicitly call out that old save data is not preserved across the refactor.

## Test Plan
- Item registry tests:
  - placeable block-items resolve the correct `placesBlockId`
  - non-placeable items do not resolve block placement
  - block drop policies resolve the expected `ItemId`
- Inventory tests:
  - selected slot returns an item stack rather than a block stack
  - adding/removing items still respects stack limits
  - empty-slot and cursor interactions remain stable after the item migration
- Authoritative gameplay tests:
  - placing with a placeable item consumes the item and writes the correct block
  - placing with a non-placeable item fails without consuming it
  - breaking a collectible block spawns the expected dropped item stack
  - picking up floor loot grants the expected item stack
- Replication tests:
  - client inventory sync carries `itemId` values
  - dropped-item spawn/update/remove events carry `itemId` values
  - held-item derivation updates correctly when the selected inventory item changes
- Persistence tests:
  - player inventories round-trip with item ids
  - dropped items round-trip with item ids
- Manual smoke tests:
  - break a block, observe an item drop, pick it up, and place it back through the selected item
  - confirm hotbar labels still read correctly
  - confirm remote/dedicated flows stay in sync with the item-based protocol

## Assumptions And Defaults
- Use the next plan filename in sequence: `0024-separate-items-from-blocks.md`.
- This plan changes the data model, not the basic block game loop. Existing place/break/pickup interactions should remain familiar after the refactor.
- A one-to-one mapping between many current blocks and items is acceptable in the first pass, as long as ids and registries remain separate.
- Backward compatibility is intentionally out of scope. Old save data, old dropped-item payloads, and old inventory encodings do not need migration support.
- The authoritative server remains the source of truth for placement, breaking, pickup, inventory mutation, and persistence.
