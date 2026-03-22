# Crosshair Overlay

## Summary
Add a centered first-person crosshair during gameplay so aiming and block interaction feel more like Minecraft and less like blind raycast guessing. The project already renders HUD overlays and a focused-block outline, so this plan is specifically about adding a lightweight play-mode crosshair without changing gameplay authority, raycast logic, or menu UI behavior.

## Key Changes

### Add a dedicated play HUD builder
- Extract the current play-mode HUD composition into a small UI helper instead of keeping it embedded inside `GameApp`.
- This builder should own:
  - the hotbar strip
  - the selected-slot label
  - the new center crosshair
- Keep it pure so it is easy to test without a native window.

### Render a Minecraft-style crosshair
- Add a small centered crosshair made from simple overlay rectangles.
- The crosshair should:
  - be visible only in play mode
  - sit at the exact screen center
  - remain readable against terrain
- Recommended default:
  - light inner bars with a dark outline/shadow
- Keep it intentionally minimal rather than animated or decorative.

### Preserve current gameplay behavior
- Do not change:
  - raycast logic
  - focused-block selection
  - break/place rules
  - server-authoritative mutation flow
- The crosshair is visual guidance only.

## Important Files
- `src/game-app.ts`
- `src/ui/components.ts`
- `src/ui/hud.ts`
- `tests/hud.test.ts`

## Test Plan
- HUD tests:
  - play HUD includes centered crosshair panels
  - hotbar still renders alongside the crosshair
  - selected slot label still reflects the chosen item
- Regression checks:
  - menu UI is unchanged
  - play HUD remains overlay-only and does not emit button actions

## Assumptions And Defaults
- The crosshair should appear only while actively playing, not in menus.
- The first pass should use the existing rect/text overlay system instead of introducing a new renderer.
- Use the next plan filename in sequence: `0011-crosshair-overlay.md`.
