# Debug Overlay TPS And Colored Indicators

## Summary
Improve the in-game debug overlay so it communicates runtime health more clearly. The current overlay exposes useful raw numbers such as FPS and lighting values, but it does not show authoritative server tick throughput and it does not visually distinguish healthy readings from degraded ones.

This plan adds a TPS indicator to the debug overlay and introduces consistent good/ok/bad color treatment for key runtime indicators, starting with FPS, TPS, and lighting readouts. The goal is faster diagnosis while testing performance, world lighting, and client/server behavior.

## Key Changes

### Add TPS to the debug overlay
- Surface current authoritative ticks-per-second in the same debug overlay that already shows FPS and lighting details.
- Prefer using an existing server-reported or client-tracked source if one already exists.
- If TPS is not currently available on the client, add a minimal replication path for a current or smoothed TPS value rather than inferring it indirectly from FPS.

### Introduce indicator severity colors
- Add a small shared color policy for debug indicators with three states:
  - good
  - ok
  - bad
- Apply this to:
  - FPS
  - TPS
  - lighting readouts
- Keep the thresholds explicit and easy to tweak.

### Define stable thresholds for runtime health
- FPS should reflect client render/update health.
- TPS should reflect authoritative simulation health.
- Lighting should reflect whether the focused/current light values are healthy or suspicious for debugging purposes.
- Strong recommendation:
  - use clearly named helpers such as `getFpsIndicatorColor` or `classifyDebugIndicator`
  - keep thresholds close to the overlay code unless reused elsewhere

### Keep debug overlay formatting readable
- Preserve the current compact debug style instead of turning it into a full diagnostic panel.
- Use color to add signal without increasing text noise.
- Keep labels short and stable so screenshots and recordings remain easy to compare across runs.

### Handle missing or initializing TPS cleanly
- If TPS is temporarily unavailable during startup, connection setup, or menu transitions, show a deliberate fallback such as:
  - `TPS --`
  - or a neutral color/state
- Avoid implying bad server health when the value is merely not initialized yet.

## Important Files
- `plans/0033-debug-overlay-tps-and-colored-indicators.md`
- `apps/client/src/game-app.ts`
- `apps/client/src/ui/hud.ts`
- `packages/core/src/shared/messages.ts`
- `packages/core/src/server/runtime.ts`
- `packages/core/src/server/world-session-controller.ts`
- `tests/hud.test.ts`
- `tests/client-server.test.ts`

## Suggested Implementation Order
1. Inspect the current debug overlay data flow and identify where FPS and lighting lines are assembled.
2. Decide where TPS should be sourced from and add the smallest clean data path to the client if needed.
3. Add shared indicator-color helpers and threshold definitions.
4. Update the overlay rendering to show TPS and apply severity colors to FPS, TPS, and lighting entries.
5. Update or add tests for overlay content and any new replicated data path.

## Test Plan
- HUD tests:
  - debug overlay includes TPS when enabled
  - FPS/TPS/lighting lines render with the expected color state for representative values
- Integration tests:
  - client/server flow exposes a valid TPS value after joining a world if replication is needed
- Manual smoke tests:
  - verify the overlay stays readable during normal play
  - confirm degraded performance or intentionally unusual lighting produces visibly different indicator colors

## Assumptions And Defaults
- Use the next plan filename in sequence: `0033-debug-overlay-tps-and-colored-indicators.md`.
- The change is scoped to the debug overlay, not the main HUD.
- Indicator colors should be informative but not flashy enough to reduce readability.
