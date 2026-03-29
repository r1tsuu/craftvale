# Inventory Item Browser

## Summary

Add a TooManyItems-style item browser to the right side of the player inventory
screen.

The first pass should be deliberately small:

- render a fixed grid of all registered items on the right side
- no search box behavior yet
- no pagination yet
- clicking an item adds it to the player's inventory

This is an inventory/UI feature with server-authoritative item granting. The
browser is only for the player inventory overlay, not the crafting-table screen.
The browser should be visible in both survival and creative mode, and clicking
an item should grant it in both modes.

## Goals

- Show a right-side item browser when the player opens the player inventory in
  both survival and creative mode.
- Place that browser to the right of the normal inventory panel in a
  Minecraft/TooManyItems-like layout.
- Populate it from the generated content registry so it automatically includes
  every obtainable item.
- Let the player click an item entry to add it to inventory.
- Keep the existing inventory, hotbar, cursor, and crafting interactions working
  normally.
- Keep the server authoritative for actually granting the item in both survival
  and creative.

## Non-Goals

- Search/filter UI
- Pagination or scrolling
- Tabs or item categories
- Dragging items directly out of the browser
- Reworking the crafting-table screen in the same pass

## Proposed Design

### 1. Treat the creative browser as an extra inventory-side panel

When the player inventory is open:

- keep the current inventory panel layout intact
- add a second panel to the right
- render a compact grid of item slots inside that panel

Recommended first pass:

- fixed number of visible cells
- enough rows/columns to cover all current registered items without paging
- same slot styling as the rest of the HUD so it feels native to the current UI

### 2. Build the item list from the content registry

The browser should not hardcode item ids.

Preferred source:

- generated item registry / content ids under `packages/core/src/world/generated/*`

The list should:

- include all non-empty items
- be kept in stable registry order for now
- be shared by the client HUD and server validation logic if possible

### 3. Add a dedicated client action for clicking browser items

The HUD should emit separate actions for creative browser cells, for example:

- `creative-browser-item:<itemId>`

The play controller should:

- surface those actions in both survival and creative
- send a dedicated message to the server requesting that item

This keeps the feature separate from normal inventory-slot interaction.

### 4. Keep granting server-authoritative

The server should handle the request and insert the clicked item into the
player's inventory using existing inventory helpers where possible.

Recommended first pass behavior:

- add one full stack on click
- prefer normal inventory insertion rules
- if no space is available, add as much as fits or do nothing

Potential follow-up behaviors can come later:

- right click for single item
- shift click for multiple stacks
- replacing held cursor stack

### 5. Preserve survival behavior cleanly

In survival mode:

- still render the browser
- still allow hover/click UI behavior
- grant the clicked stack through the same server-authoritative path used in
  creative

That keeps the behavior consistent across modes while still avoiding client-only
inventory mutation hacks.

## Important Files

- `plans/0053-creative-inventory-item-browser.md`
- `apps/client/src/ui/hud.ts`
- `apps/client/src/ui/components.ts`
- `apps/client/src/app/play-controller.ts`
- `apps/client/src/app/world-runtime.ts`
- `packages/core/src/shared/messages.ts`
- `packages/core/src/server/world-session-controller.ts`
- `packages/core/src/server/authoritative-world.ts`
- `packages/core/src/world/inventory.ts`
- `packages/core/src/world/generated/content-ids.ts`
- `packages/core/src/world/generated/content-registry.ts`
- `tests/hud.test.ts`
- `tests/play-controller.test.ts`
- `tests/client-server.test.ts`
- `tests/authoritative-world.test.ts`

## Test Plan

- HUD tests:
  - creative inventory renders the extra right-side item browser
  - survival inventory also renders it
  - clicking a browser item emits the expected action id
- Play controller tests:
  - clicking a browser item in creative sends the correct request
- clicking it in survival sends the same request path
- Server/integration tests:
  - the server accepts the request in both survival and creative
  - the granted item is inserted into inventory correctly
  - full inventory behavior is deterministic and covered
- Manual:
  - open inventory in creative
  - verify the item browser appears on the right
  - click several items and confirm they are added by the server
  - open inventory in survival
  - verify the same browser appears on the right
  - verify survival also receives the clicked item stack

## Notes

- The current inventory overlay was recently compacted to a fixed-width panel.
  This feature can extend that view with a second right-side panel rather than
  stretching the existing left panel again.
- If the item count outgrows the visible grid later, pagination or scrolling can
  be added in a follow-up plan without changing the basic creative-grant
  protocol.
