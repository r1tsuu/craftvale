# Players

## Summary

Add an explicit player system so the server can own multiple players at once instead of implicitly assuming a single local controller. The first pass should focus on stable player identity, server-authoritative player session state, and client-side knowledge of which replicated player is the local player. Each player should have a simple player name that is stored locally on the client machine, reused across runs, and optionally overridden for a launch via a CLI argument.

## Key Changes

### Add an explicit player identity model

- Introduce a stable player identifier type rather than treating the local runtime as “the player.”
- Recommended base types:
  - `PlayerName` as a simple string name
  - `PlayerProfile` or `PlayerIdentity` for locally persisted identity metadata
  - `PlayerSnapshot` for replicated authoritative player state
- A player snapshot should include at minimum:
  - player name
  - display/debug name if we want one later
  - position
  - rotation
  - connection/session presence state if needed
- Keep player identity distinct from world identity:
  - worlds remain named/seeded server data
- player names are client identity data

### Support multiple players on the server

- Refactor the authoritative world/session model so it can hold multiple players at once.
- Replace singleton assumptions such as:
  - one implicit player spawn
  - one implicit movement/input owner
  - one implicit inventory owner if inventory remains per-player
- The server should maintain a player registry keyed by player name for the active world/session.
- Minimum player lifecycle operations:
  - player connects or joins world with a player name
  - server loads or creates player state for that player name
  - server marks player active in the session
  - player disconnects/leaves without deleting long-lived identity
- Preserve server authority:
  - the client sends intents for its own player only
  - the server decides final player state and replicates it back out

### Make the client explicitly know which player is the local player

- The client should no longer infer “I am the only player.”
- World/session join responses should explicitly identify:
  - the client player name
  - the authoritative snapshot for that player
  - any other already-present players in the session
- The client runtime should store:
  - `clientPlayerName`
  - a replicated player map keyed by player name
- Input, camera, and local HUD logic should target the player whose name matches `clientPlayerName`.
- Remote players should be treated as replicated entities, not accidentally driven by local input.

### Persist the player name locally

- Add a small local client-identity persistence layer separate from world save data.
- If no player name exists locally:
  - generate a simple default player name
  - persist it in a client-local file
  - reuse it on future launches
- This storage should live alongside other client-local runtime data, not inside a world save file.
- Keep the format intentionally small and versionable, for example:
  - `player-profile.json`
  - or a tiny binary/JSON client metadata file under the storage root
- The stored player name should be per-machine/client profile, not per world.

### Allow CLI override of the local player name

- Add a startup option so the local persisted player name can be overridden from the command line.
- Recommended flag:
  - `--player-name=<name>`
- Also accept the spaced form if convenient:
  - `--player-name <name>`
- The bootstrap path should:
  - parse CLI arguments in `src/index.ts` or a nearby startup helper
  - validate the provided player name format
  - pass the effective player identity into the client/server startup flow
- Recommended default behavior:
  - CLI override wins for the current process
  - CLI override does not rewrite the stored player name unless we later add an explicit “set profile name” command
- Invalid player name input should fail fast with a clear startup error.

### Extend the client/server protocol for player-aware sessions

- Update shared message types so player identity is explicit at the protocol boundary.
- Likely additions include:
  - join/connect payloads carrying `playerName`
  - server events for player join/leave/update
  - authoritative player snapshot replication
- Keep the current transport-neutral design:
  - worker transport still works
  - future socket/network transports can reuse the same player-aware messages
- Avoid coupling player identity to transport implementation details.

### Clarify per-player versus per-world state ownership

- Decide which state belongs to the player and which belongs to the world session.
- Strong recommendation:
  - position/rotation are per-player
  - inventory is per-player
  - chunk/world blocks remain per-world
- Joining a world with the same player name should restore that player’s saved state for the world if persistence is enabled.
- A different player name joining the same world should not overwrite another player’s inventory or spawn state.

### Client runtime and rendering implications

- Extend the client runtime to maintain replicated player snapshots alongside chunks and inventory.
- Continue using the local player snapshot for:
  - movement ownership
  - camera placement
  - local HUD values
- Introduce a minimal remote-player representation path.
- First-pass rendering can stay simple:
  - placeholder boxes, billboards, or even data-only replication if visual rendering is not yet ready
- The important boundary is that the client data model must support more than one player cleanly.

## Important Files

- `src/index.ts`
- `src/game-app.ts`
- `src/shared/messages.ts`
- `src/shared/event-bus.ts`
- `src/client/world-runtime.ts`
- `src/client/worker-client-adapter.ts`
- `src/server/runtime.ts`
- `src/server/authoritative-world.ts`
- `src/server/world-storage.ts`
- `src/types.ts`
- `tests/client-server.test.ts`
- `tests/storage.test.ts`
- `tests/worker-host.test.ts`

## Test Plan

- Identity tests:
  - missing local player profile generates and persists a player name
  - subsequent launches reuse the stored player name
  - CLI name override replaces the effective runtime name
  - invalid CLI name input fails with a clear error
- Server player-session tests:
  - joining a world creates or restores player state by player name
  - multiple players can coexist in the same authoritative world session
  - disconnecting one player does not delete another player’s state
- Client replication tests:
  - join response exposes `clientPlayerName`
  - client stores remote and local player snapshots separately
  - local input updates only the client player
- Persistence tests:
  - player-local name storage is separate from world registry/chunk files
  - per-player world state, if persisted, round-trips correctly for distinct player names
- Integration smoke tests:
  - launch normally and verify stable player-name reuse
  - launch with `--player-name=<name>` and verify the client identifies that player name as local
  - connect multiple players to the same server path and verify authoritative player separation

## Assumptions And Defaults

- Use the next plan filename in sequence: `0012-players.md`.
- Player identity uses simple player-name strings.
- The local player name is client-local metadata and should not be embedded in the world registry as global world identity.
- CLI override is intended for testing, debugging, or running multiple local clients with distinct identities.
- This plan is about player identity and multi-player-capable state modeling first; a full real-network transport can follow on top of the same client/server split.
