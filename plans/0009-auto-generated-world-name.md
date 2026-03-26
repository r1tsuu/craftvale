# Auto-Generated World Name

## Summary

Make the create-world flow feel closer to Minecraft by auto-populating the world name field instead of starting empty. The default base name should follow Minecraft's current Java Edition behavior of starting from `New World`, while our implementation should also choose a unique variant when that name is already taken so world creation remains frictionless in this project.

## Key Changes

### Generate a default suggested world name

- Add a small helper that inspects the current saved-world list and returns a suggested name.
- The default base should be:
  - `New World`
- If that name already exists, choose the next available numbered variant.
- Keep the numbering deterministic and stable for the current world list.

### Prefill the create-world screen

- When the user opens the create-world screen, populate the world name field with the generated default if no explicit custom name is already being carried forward.
- The create-world screen should no longer feel blank or blocked on typing before it is useful.
- Keep the seed field blank by default.

### Fallback during creation

- If the user clears the field and confirms anyway, fall back to the same generated suggested name instead of surfacing a `WORLD NAME REQUIRED` error.
- This keeps world creation aligned with the intent of an auto-generated default name.

### Preserve existing world focus behavior

- The worlds screen should stay click-to-focus only.
- The new default-name behavior should not silently auto-focus or auto-join any world.

## Important Files

- `src/client/menu-state.ts`
- `src/game-app.ts`
- `src/ui/menu.ts`
- `tests/menu-state.test.ts`
- `tests/menu-ui.test.ts`

## Test Plan

- helper tests:
  - returns `New World` when there are no worlds
  - returns the next available unique variant when `New World` already exists
- menu-state tests:
  - opening create-world seeds the input with the generated default name
  - refreshing worlds does not break the generated-name logic
- app/runtime tests:
  - creating a world with an empty field still succeeds by using the generated default
- UI tests:
  - the create-world screen shows the prefilled generated name

## Assumptions And Defaults

- This matches the Minecraft-style default base name while adapting uniqueness to our stricter world-name storage model.
- The numbered variants should stay simple and readable rather than introducing filesystem-specific suffix noise.
- Use the next plan filename in sequence: `0009-auto-generated-world-name.md`.
