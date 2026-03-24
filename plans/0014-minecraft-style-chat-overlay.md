# Minecraft-Style Chat Overlay

## Summary
Improve the in-game chat HUD so it behaves more like Minecraft: anchor the chat feed in the bottom-left, render it on a translucent background instead of an opaque slab, and let closed-chat messages fade away after a short time. The goal is to keep chat readable when active without permanently covering the play view.

## Key Changes

### Move the chat feed and input to a proper bottom-left layout
- Rework the HUD chat layout in `src/ui/hud.ts` so the feed sits in the bottom-left corner with consistent screen margins.
- Keep the input bar directly below the feed when chat is open, matching the visual rhythm from Minecraft.
- Size the feed from the bottom upward so recent messages stay closest to the input line.
- Leave enough vertical spacing from the bottom hotbar and selected-item label so the two overlays do not fight for space.

### Add translucent chat backgrounds instead of fully opaque panels
- Extend the UI component/rendering path so HUD panels can carry alpha, not just RGB.
- This likely means updating:
  - `src/ui/components.ts`
  - `src/ui/renderer.ts`
  - `src/render/rect.ts`
  - any shared overlay shader path used by rectangle rendering
- Use alpha for the chat background panels first, without forcing the rest of the HUD to adopt transparency immediately.
- Keep text fully readable over terrain by using a dark background with moderate opacity rather than a very light wash.

### Make closed-chat messages expire after a short visibility window
- Treat chat history as two related concerns:
  - bounded retained history for the current session
  - a smaller visible subset for the HUD when chat is closed
- When chat is closed, only show recent messages whose age is within a configurable lifetime.
- Recommended behavior:
  - new messages appear immediately
  - older messages disappear automatically after several seconds
  - when the user opens chat, the recent retained session history becomes visible again instead of only the still-live subset
- Use the existing `receivedAt` timestamp on `ChatEntry` to derive visibility instead of introducing per-message timers in the renderer.

### Add fade-out behavior instead of a hard pop where practical
- Prefer a staged fade near the end of the message lifetime so lines soften before disappearing.
- Start with panel alpha fade first if text alpha support is not yet available.
- If text alpha is easy to support in the overlay pipeline, fade text and panel together for a cleaner result.
- Keep the fade logic deterministic and frame-derived from timestamps rather than storing mutable animation state per message.

### Keep chat-open behavior stable and readable
- While chat is open:
  - keep the input bar fully visible
  - keep the chat feed background more opaque than the passive closed state
  - show more retained messages than the closed-chat overlay if that improves usability
- The open chat state should override auto-hide so users can review recent lines while typing.

### Separate HUD presentation from chat storage rules
- Keep the authoritative/server chat protocol unchanged for this pass unless implementation reveals a real gap.
- Continue storing a bounded in-memory session log in `ClientWorldRuntime`.
- Add a small presentation-oriented helper or selector that answers:
  - which messages are visible right now
  - what opacity each visible message/background should use
  - whether chat is in open or passive display mode
- Avoid putting layout-specific logic into `GameApp` if it can live in HUD helpers.

### Make timing and constants explicit
- Introduce named constants for:
  - closed-chat max visible lines
  - open-chat max visible lines
  - message lifetime in seconds
  - fade duration in seconds
  - panel opacity values for open and closed states
  - bottom/left margins and gap above the hotbar region
- Keep these values near the HUD chat implementation so tuning does not require digging through unrelated gameplay files.

## Important Files
- `plans/0014-minecraft-style-chat-overlay.md`
- `src/game-app.ts`
- `src/client/world-runtime.ts`
- `src/ui/hud.ts`
- `src/ui/components.ts`
- `src/ui/renderer.ts`
- `src/render/rect.ts`
- `src/render/text.ts`
- `tests/hud.test.ts`
- `tests/client-server.test.ts`

## Implementation Notes
- The current chat feed is already bottom-left aligned horizontally, but it is positioned too high and uses a large opaque frame. The new layout should feel attached to the lower-left HUD area.
- The current UI component model only supports RGB colors. Opacity requires a small but deliberate extension through the UI and overlay rendering pipeline.
- The current chat log already stores `receivedAt`, which is a good base for passive expiration and fade calculations.
- The hotbar remains bottom-center, so the chat overlay should not reserve the entire lower third of the screen.

## Test Plan
- HUD layout tests:
  - closed chat renders its feed in the bottom-left with the new frame position
  - open chat renders the input bar directly beneath the feed
  - chat layout still coexists with the hotbar and mode badge
- Visibility tests:
  - recent messages are visible while chat is closed
  - expired messages are omitted from the closed-chat overlay
  - opening chat shows retained recent history even if some lines would be hidden in passive mode
- Fade/opacity tests:
  - chat background panels use alpha-enabled colors
  - messages in the fade window receive reduced opacity compared with fresh messages
- Runtime tests:
  - incoming chat messages still append to the bounded session log
  - the log remains bounded even though passive display hides expired entries
- Regression tests:
  - system and player chat formatting still render correctly
  - chat input text still appears and submits as before

## Assumptions And Defaults
- Use the next plan filename in sequence: `0014-minecraft-style-chat-overlay.md`.
- Message disappearance applies to the passive in-game HUD, not to server/session storage for the current run.
- Opening chat should temporarily reveal recent retained history instead of only the not-yet-expired passive subset.
- This plan does not expand scope into scrollback, chat settings, clickable links, or persistent chat logs.
