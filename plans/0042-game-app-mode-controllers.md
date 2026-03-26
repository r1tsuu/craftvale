# Game App Mode Controllers

## Context

`apps/client/src/app/game-app.ts` is a 1,532-line monolith that owns three
distinct app modes (menu / loading / playing) in a single class. The `tick()`
method branches on `appMode` across all three modes, with each mode's state
and logic interleaved. This was identified as the top architectural priority
before adding new features.

This plan splits the file into four focused files with no behavior changes.

## New Files

### `apps/client/src/app/loading-controller.ts`

Owns loading-mode state and the loading-screen tick. Manages the loading token
machinery used by the join flow in `GameApp`.

### `apps/client/src/app/menu-controller.ts`

Owns `menuState` and the menu-mode tick. Contains all menu action dispatch,
world/server management helpers, and exposes callbacks for `GameApp` to call
after join succeeds or fails.

### `apps/client/src/app/play-controller.ts`

Owns play-mode state (`chatOpen`, `chatDraft`, `inventoryOpen`, `pauseScreen`,
`firstPersonSwingRemaining`, debug-memory helpers) and the play-mode tick,
which runs the fixed-step gameplay loop, input routing, HUD build, and returns
the frame data needed by `renderFrame`.

## GameApp After Refactor

Retains: app mode, timing, connections, settings, `joinWorld`/`joinServer`,
`completeWorldJoinLoading`, `registerConnectionEventHandlers`, `renderFrame`,
`syncCursorMode`, `syncWindowTitle`, and the main `tick` dispatcher:

```ts
if (appMode === 'menu')    result = await menuController.tick(input)
if (appMode === 'loading') result = loadingController.tick(input, ...)
else                       result = await playController.tick(context)
```

## Important Files

- `apps/client/src/app/game-app.ts` — heavily modified
- `apps/client/src/app/loading-controller.ts` — new
- `apps/client/src/app/menu-controller.ts` — new
- `apps/client/src/app/play-controller.ts` — new

## Verification

1. `bun run typecheck` — no errors
2. `bun test` — all tests pass
3. Manual: launch, navigate menu, join world, play, chat, pause, exit to menu
4. Manual: `bun run dev:full` — multiplayer join flow
