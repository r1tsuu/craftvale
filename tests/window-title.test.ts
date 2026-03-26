import { expect, test } from 'bun:test'

import { getBaseWindowTitle, getSessionWindowTitle } from '../apps/client/src/app/window-title.ts'

test('base window title uses the player name', () => {
  expect(getBaseWindowTitle('Sasha')).toBe('Craftvale - Sasha')
})

test('singleplayer session title uses the world name while playing', () => {
  expect(
    getSessionWindowTitle({
      playerName: 'Sasha',
      appMode: 'playing',
      connectionMode: 'local',
      currentWorldName: 'New World',
      connectedServerAddress: null,
    }),
  ).toBe('Craftvale - Sasha - New World')
})

test('multiplayer session title uses the server address while playing', () => {
  expect(
    getSessionWindowTitle({
      playerName: 'Sasha',
      appMode: 'playing',
      connectionMode: 'remote',
      currentWorldName: 'Server World',
      connectedServerAddress: '127.0.0.1:7777',
    }),
  ).toBe('Craftvale - Sasha - 127.0.0.1:7777')
})

test('menu and loading modes keep the base title', () => {
  for (const appMode of ['menu', 'loading'] as const) {
    expect(
      getSessionWindowTitle({
        playerName: 'Sasha',
        appMode,
        connectionMode: 'local',
        currentWorldName: 'New World',
        connectedServerAddress: '127.0.0.1:7777',
      }),
    ).toBe('Craftvale - Sasha')
  }
})
