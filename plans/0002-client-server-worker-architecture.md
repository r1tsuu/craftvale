# Client/Server Messaging Architecture With Worker Adapter

## Summary
Refactor the current single-process game loop into a client/server-style architecture built around typed messaging, transport adapters, and separate client/server event buses. The first adapter is a single-player Worker adapter that does not create a real network server; it spins up a worker, forwards messages between client and server runtimes, and preserves the same architecture boundary we will later reuse for real networking.

In this first cut, the server becomes authoritative for all world writes and for world lifecycle/persistence. That includes chunk generation, block place/remove, world creation, world join, world listing, world deletion, and binary save/load. The client owns rendering, input, UI, prediction-free local presentation, and applying authoritative world snapshots/patches received from the server.

## Key Changes

### Messaging and adapter architecture
- Add a shared message schema layer for:
  - request/response envelopes with correlation IDs
  - one-way events/notifications
  - discriminated `type` fields for all client/server messages
- Introduce two event bus APIs with matching ergonomics:
  - `client.eventBus.send(...)` / `client.eventBus.on(...)`
  - `server.eventBus.send(...)` / `server.eventBus.on(...)`
- Add adapter abstractions:
  - `ClientAdapter`: connects client bus to a transport
  - `ServerAdapter`: connects server bus to a transport
  - `WorkerClientAdapter` and `WorkerServerAdapter` for the initial single-player path
- Use request/response for operations that need results:
  - world list
  - world create
  - world join
  - chunk request
  - save flush
  - world delete
- Reserve notifications/events for push updates:
  - chunk delivered
  - chunk changed
  - save status
  - joined world
  - world deleted
  - server error

### Server runtime and authoritative world ownership
- Move terrain generation and persistence behind a server runtime module.
- The server runtime owns:
  - active world session
  - loaded/generated chunk cache
  - save metadata
  - world seed
  - mutation application and dirty tracking
- Remove direct client-side world generation calls from the play loop.
- Replace direct local writes with messages:
  - client requests chunks near player position
  - client sends block mutation intents
  - server validates/applies mutation
  - server emits authoritative chunk updates back to client
- Keep one active world per running server session.
  - world identity is chosen on create/join
  - subsequent chunk/mutation/save requests target the active world implicitly
  - world ID does not need to be included on every gameplay request

### Persistence and named-world model
- Add named worlds with seeds and metadata.
- Persist world data in binary files, not JSON.
- Introduce a world storage layout with:
  - a world registry/index file for world names, seeds, and metadata
  - one directory per world
  - binary chunk files within each world directory
- Minimum world-management server operations:
  - `listWorlds`
  - `createWorld(name, seed)`
  - `joinWorld(name)`
  - `deleteWorld(name)`
  - `saveWorld()`
- Binary persistence policy for v1:
  - save only non-empty/generated chunk data needed to reconstruct the world
  - store enough metadata to preserve seed and versioning
  - include a format/version header so later migrations are possible
- Server should mark changed chunks dirty and flush them on explicit save plus on controlled lifecycle points like join/switch/exit.

### Client runtime and UI flow
- Split current app bootstrap into:
  - client app/runtime
  - worker-backed server runtime
  - shared message definitions
- Keep the client-side `VoxelWorld`, but convert it into a replicated/render cache populated by server messages instead of local generation.
- Replace direct `ensureActiveArea()` generation with chunk request scheduling:
  - client computes needed chunk radius around player
  - requests missing chunks from server
  - caches received chunks locally for render/raycast/collision
- Keep rendering, highlight, HUD, and FPS controller on the client.
- Update the menu/UI system to support full world management:
  - world list screen
  - create-world form
  - custom seed input
  - join/start selected world
  - delete world action
- On `START/JOIN`, client first joins a world through the server, then enters gameplay once initial world/session state is acknowledged.

### Important public interfaces/types
- Add shared message types such as:
  - `ClientToServerMessage`
  - `ServerToClientMessage`
  - `RequestEnvelope<T>`
  - `ResponseEnvelope<T>`
- Add world/session DTOs such as:
  - `WorldSummary`
  - `CreateWorldRequest`
  - `JoinWorldRequest`
  - `ChunkRequest`
  - `ChunkPayload`
  - `BlockMutationRequest`
- Add adapter/runtime interfaces such as:
  - `IEventBus`
  - `IClientAdapter`
  - `IServerAdapter`
  - `ServerSession`
  - `WorldStorage`
- Keep chunk payloads explicit and transport-safe:
  - chunk coord
  - block buffer payload
  - dirty/revision marker or sequence number for authoritative replacement

## Test Plan
- Messaging tests:
  - request/response correlation works across worker boundary
  - one-way server notifications reach client handlers
  - unknown/invalid message types fail predictably
- Server world tests:
  - chunk generation happens only on server handlers
  - block mutations update server chunk state and dirty flags
  - joining a world activates the correct seed/world session
- Persistence tests:
  - create/list/join/delete worlds works
  - binary chunk save/load round-trips block data
  - seed metadata persists correctly
  - deleting a world removes its registry entry and files
- Client replication tests:
  - chunk responses populate client render world
  - server mutation notifications update focused/rendered chunks
  - client no longer depends on local generation for gameplay chunks
- UI/menu tests:
  - create world with custom seed dispatches correct request
  - join selected world dispatches correct request
  - delete action dispatches correct request and refreshes list
- Integration smoke scenarios:
  - boot app, list worlds, create world, join world, receive initial chunks
  - place/remove blocks, save, restart, rejoin, and verify persisted state

## Assumptions And Defaults
- First transport is single-player only and uses a Worker adapter; no real sockets/HTTP/WebRTC yet.
- Server is authoritative for all world writes from the first cut.
- Persistence uses binary chunk files plus a world registry/index.
- Named worlds with seeds are part of the first implementation, and the menu includes full create/list/join/delete flows.
- One server session has one active world after join, so gameplay requests do not need to repeat world identity.
- Client-side prediction for block edits/chunk generation is out of scope for this pass; client applies authoritative server updates only.
