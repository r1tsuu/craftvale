# WebSocket Multiplayer Transport And Server Browser

## Summary
Add a real multiplayer transport built on WebSockets, while keeping the existing typed client/server message model and preserving worker-backed local play as a separate mode. The important architectural step is not just adding a socket adapter: the current server runtime is still singleton-player shaped, so this plan first splits shared world ownership from per-connection session ownership. On top of that server foundation, add a multiplayer menu flow with saved servers, manual server entry, join/delete actions, and development scripts for running a standalone server or a combined local client-plus-server setup.

## Key Changes

### Split server ownership into shared world state and per-client session state
- The current runtime should not be exposed directly as a multi-client server.
- Today it still owns one active world and one current player identity at a time.
- Strong recommendation:
  - keep authoritative world ownership in a shared server-side manager
  - move connection-local player/session state into a dedicated per-client session runtime
- Recommended shape:
  - `ServerApp` or `DedicatedServerHost` owns listening sockets, active connections, and loaded worlds
  - `WorldSessionManager` or similar owns active `AuthoritativeWorld` instances keyed by world name
  - `ClientSessionRuntime` owns the current connected player, joined world name, and message routing for one transport connection
- This creates the right boundary for true multiplayer:
  - one world can host multiple active players
  - each socket connection maps to one server session
  - transport adapters do not need to fake singleton state

### Keep the typed message/event protocol and add a network-safe transport layer
- Preserve `src/shared/messages.ts` and `src/shared/event-bus.ts` as the semantic contract.
- Do not invent a second gameplay protocol for networking.
- Add a WebSocket-backed `TransportPort` implementation so the same request/event semantics work over the network.
- Strong recommendation:
  - add a shared codec layer for transport-safe serialization
  - keep chunk payloads efficient instead of falling back to naive JSON arrays for large binary data
- Good first-pass options:
  - binary WebSocket frames with a compact envelope
  - or JSON envelopes with explicit binary encoding only if simplicity is worth the temporary bandwidth cost
- The key is to keep transport details below the event-bus boundary instead of leaking socket logic into gameplay code.

### Add a dedicated WebSocket server adapter
- Introduce a real server-side adapter for socket connections.
- Recommended responsibilities:
  - own one WebSocket connection
  - translate raw frames into typed client messages
  - translate server events/responses back into encoded frames
  - surface clean disconnect handling
- This should parallel the existing worker adapter model:
  - worker mode remains one transport implementation
  - WebSocket mode becomes another transport implementation
- Strong recommendation:
  - do not bypass `ServerEventBus`
  - keep adapters thin and keep gameplay logic in shared runtime/server-session code

### Add a dedicated client adapter for remote servers
- Add a `WebSocketClientAdapter` alongside `WorkerClientAdapter`.
- Responsibilities:
  - open/close the remote connection
  - reconnect or fail fast clearly
  - encode outgoing requests/events
  - decode incoming responses/events
- Keep `ClientWorldRuntime` transport-agnostic:
  - it should not care whether updates came from a worker or a socket
- This lets the app choose between:
  - local single-player via worker-backed server
  - remote multiplayer via WebSocket server

### Add menu-level multiplayer flow and saved-server management
- Add a new `Multiplayer` option to the main menu.
- The multiplayer screen should include:
  - a list of saved servers
  - an add-server flow with name input and IP/host input
  - a join-server button
  - a back button
  - a delete-server button directly next to each saved server row
- Strong recommendation:
  - treat saved servers similarly to local player settings/profile storage
  - store them in a small client-local JSON file
- Recommended saved server shape:
  - display name
  - host or IP
  - optional port
  - created/updated timestamp if useful for sorting
- Good UI behavior:
  - selecting a row enables `Join Server`
  - deleting a selected row clears selection safely
  - invalid host input should fail clearly before trying to connect

### Keep local worlds and multiplayer worlds as separate menu concepts
- The current world list is local-world oriented.
- Multiplayer should not overload that same list with mixed concepts.
- Strong recommendation:
  - keep `Singleplayer`/local world flow separate from `Multiplayer`/saved servers flow
  - share menu-shell styling and common UI helpers, but not the underlying data model
- This will keep local save management and remote server joining easy to understand.

### Add a persisted client-side saved-server store
- Add a small storage module for saved multiplayer servers.
- Suggested location:
  - `data/client/saved-servers.json`
- Responsibilities:
  - create default empty list
  - validate and normalize stored entries
  - support add/update/delete/list operations
- The menu should load this list on startup and refresh it after writes.
- Strong recommendation:
  - key entries by a stable local id rather than raw host string so rename/edit behavior stays simple later

### Add a standalone dedicated server entrypoint
- Add a top-level server bootstrap that starts only the authoritative WebSocket server.
- This should not create a native window or client app shell.
- Recommended responsibilities:
  - create the shared server app
  - bind a port
  - log listen address and storage root
  - shut down cleanly on process exit
- This is the basis for real multiplayer testing and future deployment.

### Add development scripts for dedicated and full-stack local multiplayer flow
- Add `dev:server`:
  - starts only the dedicated server
- Add `dev:full`:
  - starts the dedicated server plus the current desktop client dev flow together
  - pre-fills the saved server list with one local entry for convenience
- Strong recommendation:
  - keep the current `dev` script unchanged for fast single-player iteration
  - make `dev:full` additive rather than replacing the current local loop
- The local prefilled server entry should be explicit and stable, for example:
  - name: `Local Server`
  - host: `127.0.0.1`
  - default dev port

### Make disconnect/error handling explicit
- Real transport introduces failure cases the worker mode does not have.
- The multiplayer plan should include:
  - connection timeout handling
  - clean disconnect to menu
  - user-visible connect failure messages
  - graceful handling when the remote server drops mid-session
- Recommended first pass:
  - fail fast back to menu with a clear status message
  - avoid complex reconnect behavior until the baseline transport is stable

### Keep worker mode as a first-class local transport
- Do not delete the existing worker architecture.
- It remains useful for:
  - local single-player
  - offline testing
  - deterministic gameplay iteration without network overhead
- The long-term goal should be transport choice, not replacing one mode with another before the networking path is mature.

### Stage the work so multiplayer transport lands safely
- Strong recommendation:
  - implement session/runtime split before the socket adapter
  - implement the socket adapter before the multiplayer menu flow
  - add saved-server persistence and dev scripts only after the transport path can connect successfully
- No backward compatibility is required for this plan:
  - old worker-only runtime boundaries can be refactored directly
  - old menu-state shapes can be replaced rather than shimmed
  - old client-local saved data formats can be rewritten if needed
- A good execution sequence:
  - shared server app plus per-session runtime
  - WebSocket server adapter and standalone server entry
  - WebSocket client adapter and connection bootstrap
  - multiplayer menu and saved server storage
  - dev scripts and local convenience prefill

## Important Files
- `plans/0021-websocket-multiplayer-transport-and-server-browser.md`
- `README.md`
- `architecture.md`
- `package.json`
- `src/index.ts`
- `src/game-app.ts`
- `src/client/client-adapter.ts`
- `src/client/worker-client-adapter.ts`
- `src/client/menu-state.ts`
- `src/client/*` for saved-server storage
- `src/server/runtime.ts`
- `src/server/server-adapter.ts`
- `src/server/worker-host.ts`
- `src/server/worker-entry.ts`
- `src/server/*` for dedicated server bootstrap and connection/session management
- `src/shared/messages.ts`
- `src/shared/event-bus.ts`
- `src/shared/transport.ts`
- `src/ui/menu.ts`
- `tests/client-server.test.ts`
- `tests/worker-host.test.ts`
- `tests/*` for multiplayer menu, saved-server storage, and dedicated server transport coverage

## Test Plan
- Session/runtime architecture tests:
  - multiple connected sessions can join the same world without overwriting each other
  - disconnecting one session does not collapse shared world state for remaining players
  - per-session request routing uses the correct player identity
- WebSocket transport tests:
  - request/response correlation still works over the socket transport
  - chunk delivery and authoritative events serialize and deserialize correctly
  - disconnects surface cleanly to both client and server
- Saved-server storage tests:
  - saved servers persist locally across restarts
  - invalid stored entries are normalized or rejected safely
  - add/delete/update flows preserve selection and ordering expectations
- Menu/UI tests:
  - main menu exposes a multiplayer entry point
  - multiplayer screen shows saved servers, add server, join, back, and delete actions
  - delete button appears alongside each server row
  - join button is gated correctly when nothing is selected
- Script/manual smoke tests:
  - `bun run dev:server` starts only the dedicated server
  - `bun run dev:full` starts server plus client flow and preloads one localhost server entry
  - joining the local dev server from the multiplayer menu enters a live session successfully
  - two clients can connect to the same dev server and see each other

## Assumptions And Defaults
- Use the next plan filename in sequence: `0021-websocket-multiplayer-transport-and-server-browser.md`.
- WebSocket is the recommended first real transport for this project.
- Worker-backed local play remains supported and is not removed by this plan.
- The current typed message/event contract stays the gameplay protocol boundary.
- Real multiplayer requires splitting per-connection session state from shared world ownership before or alongside the transport implementation.
- Saved servers are client-local metadata, not server-authoritative world data.
- Backward compatibility is not required:
  - it is acceptable to replace existing runtime, menu, and local metadata shapes outright instead of preserving legacy formats or interfaces.
