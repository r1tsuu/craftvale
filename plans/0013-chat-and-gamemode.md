# Chat And Gamemode Commands

## Summary

Add an in-game chat system with slash-command support, then use that command path to introduce the first server-authoritative gameplay command: `gamemode`. The first pass should focus on a clean chat/input loop, transport-neutral command messages, authoritative per-player gamemode state, and creative-mode flight toggled by double-tapping `Space`. `gamemode 0` should restore the current normal movement model, while `gamemode 1` should enable creative-style flying.

## Key Changes

### Add an explicit in-game chat state on the client

- Introduce a dedicated chat/input mode instead of overloading the HUD text or menu typing paths.
- The client app should track at minimum:
  - whether chat is open
  - current draft text
  - a bounded recent chat/system message log
  - timing/visibility rules if we want fading history later
- Opening chat should temporarily redirect typed text away from world/menu interactions.
- While chat is open:
  - gameplay actions like break/place should not fire
  - movement may remain active or pause depending on implementation choice, but command submission should be reliable
  - `Enter` should submit
  - `Esc` should close without submitting
  - `Backspace` and typed characters should edit the draft
- Recommended activation keys:
  - `/` opens chat prefilled with `/`
  - `T` opens a blank chat draft if convenient
- Keep chat-state ownership in `GameApp`, not in the renderer.

### Add replicated chat/system messages to the protocol

- Extend the shared protocol so chat is a first-class client/server concept.
- Likely additions:
  - client event or request for submitting a chat line
  - server event for replicated chat entries and command/system feedback
- Chat entries should distinguish at least:
  - normal player chat
  - system/command feedback
  - sender player name for normal chat
- Keep the protocol transport-neutral so the same message shapes work for the worker transport now and sockets later.

### Route slash commands through chat submission

- Treat slash-prefixed chat lines as commands instead of building a separate debug-only input path.
- Recommended behavior:
  - if submitted text starts with `/`, the server parses it as a command
  - otherwise the server emits a normal chat message
- The command parser should be simple and explicit:
  - tokenize by whitespace
  - command name is case-insensitive
  - arguments are validated on the server
- Invalid commands should return a system message to the submitting player with a clear error.

### Add per-player authoritative gamemode state

- Introduce explicit per-player gamemode state owned by the server.
- Recommended first-pass type:
  - `PlayerGamemode = 0 | 1`
  - or a named enum if we prefer `survival`/`creative` internally
- This state should live with other player-owned session data rather than as a client-only toggle.
- Joining a world with the same player name should restore the saved gamemode for that player if persistence is enabled.
- The replicated player snapshot should expose gamemode so the client can drive movement and HUD behavior from authoritative state.

### Implement `/gamemode` as the first command

- Add server-side handling for:
  - `/gamemode 0`
  - `/gamemode 1`
- The command should operate on the submitting player in the first pass.
- Expected behavior:
  - `0` switches to normal mode
  - `1` switches to creative mode
- Invalid usage should return a system usage/error line, for example when no argument or an unsupported value is provided.
- Successful changes should emit feedback so the player can see the result in chat.
- If useful, also mirror the result into existing HUD/status text, but chat feedback is the main path.

### Add creative flight with double-space toggle

- Creative mode should enable a flight path controlled by the existing movement input model.
- Strong recommendation:
  - double-tap `Space` toggles flying on/off while in gamemode `1`
  - when flying is active, `Space` ascends and `Shift` descends
  - gravity is disabled while flying is active
  - normal collision may remain enabled unless we explicitly choose noclip later
- Gamemode `0` should immediately disable flying and restore current gravity/jump behavior.
- The double-tap logic should be owned by gameplay input state, not hidden inside the native bridge.
- Recommended implementation details:
  - track the last `Space` press edge timestamp
  - use a short configurable double-tap window
  - only toggle flight on press edges, not on key hold

### Keep movement behavior cleanly separated between normal and creative

- `PlayerController` currently assumes one grounded movement model with gravity and jump.
- Refactor it so movement mode is explicit rather than threading creative exceptions through the current jump logic.
- A clean first pass would split behavior into:
  - normal grounded movement
  - creative flying movement
- This keeps future features such as spectator or noclip from becoming tangled with jump/gravity code.

### Persist chat-relevant player state separately from transient chat history

- Gamemode is durable player state and should persist with the player save for a world.
- Chat history is session/UI state and should not be stored in world saves in this first pass unless intentionally scoped in later.
- The server may keep an in-memory recent chat buffer for current-session replication, but persistence is optional and should not block the gamemode work.

### Client runtime and HUD implications

- Extend the client runtime to hold:
  - recent chat log
  - local chat draft state if runtime ownership is preferred
  - replicated player gamemode through the player snapshot
- Add HUD rendering for:
  - chat history pane or bottom-left feed
  - active draft/input bar when chat is open
  - optional small indicator for creative/flying state
- Keep the first-pass visuals simple and functional rather than over-designing the chat widget.

## Important Files

- `src/game-app.ts`
- `src/game/player.ts`
- `src/platform/native.ts`
- `src/shared/messages.ts`
- `src/client/world-runtime.ts`
- `src/server/runtime.ts`
- `src/server/authoritative-world.ts`
- `src/server/world-storage.ts`
- `src/types.ts`
- `src/ui/hud.ts`
- `tests/player.test.ts`
- `tests/hud.test.ts`
- `tests/client-server.test.ts`
- `tests/storage.test.ts`

## Test Plan

- Chat input tests:
  - opening chat captures typed text instead of menu/gameplay text paths
  - submitting chat sends the expected payload
  - `Esc` closes chat without submission
  - slash-prefixed input is routed as a command path
- Command parsing tests:
  - `/gamemode 1` switches the submitting player to creative
  - `/gamemode 0` switches the submitting player back to normal
  - invalid values produce a system error message
  - unknown commands produce a system error message
- Movement tests:
  - normal mode still jumps and uses gravity as before
  - creative mode double-space toggles flying
  - while flying, `Space` ascends and `Shift` descends
  - leaving creative mode disables flying immediately
- Replication tests:
  - authoritative player snapshots include gamemode
  - client applies server gamemode updates for the local player
  - chat/system messages replicate to the client log
- Persistence tests:
  - player gamemode round-trips through storage for a given player/world
  - chat history is not written into persistent world/player save files in this first pass
- Integration smoke tests:
  - join world, open chat, send a normal message
  - run `/gamemode 1`, double-space to fly, and verify creative movement behavior
  - run `/gamemode 0` and verify grounded movement is restored

## Assumptions And Defaults

- Use the next plan filename in sequence: `0013-chat-and-gamemode.md`.
- Chat is session-level UI/runtime state; gamemode is per-player authoritative state.
- Slash commands are entered through the same chat submission flow as normal chat messages.
- The first command scope is self-targeted only; admin/other-player targeting can come later.
- `gamemode 1` means creative flight in this phase, not a full Minecraft-style infinite-inventory rewrite unless we explicitly expand scope later.
- Double-space flight should use press-edge timing in gameplay code rather than native key-repeat behavior.
