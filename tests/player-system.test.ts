import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PlayerSystem } from '../packages/core/src/server/player-system.ts'
import { WorldEntityState } from '../packages/core/src/server/world-entity-state.ts'
import { BinaryWorldStorage } from '../packages/core/src/server/world-storage.ts'

test('player system allocates player entities from the shared world entity registry', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-player-system-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    await storage.createWorld('Alpha', 42)

    const worldEntities = new WorldEntityState()
    const firstWorldActor = worldEntities.registry.createEntity('item')
    const playerSystem = new PlayerSystem('Alpha', storage, [8.5, 70, 8.5], worldEntities)

    const joinedAlice = await playerSystem.joinPlayer('Alice')
    const joinedBob = await playerSystem.joinPlayer('Bob')

    expect(firstWorldActor).toBe('item:1')
    expect(joinedAlice.clientPlayer.entityId).toBe('player:2')
    expect(joinedBob.clientPlayer.entityId).toBe('player:3')

    await playerSystem.save()

    const reloadedWorldEntities = new WorldEntityState()
    const reloadedPlayerSystem = new PlayerSystem(
      'Alpha',
      storage,
      [8.5, 70, 8.5],
      reloadedWorldEntities,
    )

    const rejoinedAlice = await reloadedPlayerSystem.joinPlayer('Alice')
    const nextWorldActor = reloadedWorldEntities.registry.createEntity('item')
    const rejoinedBob = await reloadedPlayerSystem.joinPlayer('Bob')

    expect(rejoinedAlice.clientPlayer.entityId).toBe('player:2')
    expect(nextWorldActor).toBe('item:3')
    expect(rejoinedBob.clientPlayer.entityId).toBe('player:3')
    expect(nextWorldActor).not.toBe(rejoinedAlice.clientPlayer.entityId)
    expect(nextWorldActor).not.toBe(rejoinedBob.clientPlayer.entityId)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})
