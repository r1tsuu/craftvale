import { expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  ClientToServerMessage,
  ServerToClientMessage,
} from '../packages/core/src/shared/messages.ts'

import { PortClientAdapter } from '../apps/client/src/app/client-adapter.ts'
import { ClientWorldRuntime } from '../apps/client/src/app/world-runtime.ts'
import {
  type DedicatedServerSessionHost,
  loadOrCreateDedicatedWorld,
} from '../apps/dedicated-server/src/dedicated-server.ts'
import { ServerRuntime } from '../packages/core/src/server/runtime.ts'
import { PortServerAdapter } from '../packages/core/src/server/server-adapter.ts'
import { WorldSessionController } from '../packages/core/src/server/world-session-controller.ts'
import {
  DEDICATED_WORLD_DIRECTORY_NAME,
  DedicatedWorldStorage,
} from '../packages/core/src/server/world-storage.ts'
import { createInMemoryTransportPair } from '../packages/core/src/shared/transport.ts'

const registerRuntimeHandlers = (
  client: PortClientAdapter,
  runtime: ClientWorldRuntime,
): Array<() => void> => [
  client.eventBus.on('chunkDelivered', ({ chunk }) => {
    runtime.applyChunk(chunk)
  }),
  client.eventBus.on('chunkChanged', ({ chunk }) => {
    runtime.applyChunk(chunk)
  }),
  client.eventBus.on('inventoryUpdated', ({ playerEntityId, inventory }) => {
    if (playerEntityId === runtime.clientPlayerEntityId) {
      runtime.applyInventory(inventory)
    }
  }),
  client.eventBus.on('droppedItemSpawned', ({ item }) => {
    runtime.applyDroppedItem(item)
  }),
  client.eventBus.on('droppedItemUpdated', ({ item }) => {
    runtime.applyDroppedItem(item)
  }),
  client.eventBus.on('droppedItemRemoved', ({ entityId }) => {
    runtime.removeDroppedItem(entityId)
  }),
  client.eventBus.on('playerJoined', ({ player }) => {
    runtime.applyPlayer(player)
  }),
  client.eventBus.on('playerUpdated', ({ player }) => {
    runtime.applyPlayer(player)
  }),
  client.eventBus.on('playerLeft', ({ playerEntityId, playerName }) => {
    runtime.removePlayer(playerEntityId, playerName)
  }),
  client.eventBus.on('pigUpdated', ({ pig }) => {
    runtime.applyPig(pig)
  }),
  client.eventBus.on('chatMessage', ({ entry }) => {
    runtime.appendChatMessage(entry)
  }),
]

const createDedicatedSessionHarness = (
  host: DedicatedServerSessionHost,
): {
  client: PortClientAdapter
  runtime: ClientWorldRuntime
  controller: WorldSessionController
  cleanup: () => Promise<void>
} => {
  const transport = createInMemoryTransportPair<
    ServerToClientMessage,
    ClientToServerMessage,
    ClientToServerMessage,
    ServerToClientMessage
  >()
  const client = new PortClientAdapter(transport.left)
  const runtime = new ClientWorldRuntime(client)
  const adapter = new PortServerAdapter(transport.right)
  const controllerRef: { current: WorldSessionController | null } = { current: null }
  const controller = new WorldSessionController(
    {
      contextLabel: host.contextLabel,
      getWorld: () => host.world,
      allocateIntentSequence: () => host.runtime.allocateIntentSequence(),
      sendToPlayer: (playerEntityId, message) => {
        host.runtime.sendToPlayer(playerEntityId, message)
      },
      broadcast: (message, options) => {
        host.runtime.broadcast(message, options)
      },
      afterJoin: (player) => {
        const activeController = controllerRef.current
        if (!activeController) {
          return
        }
        host.runtime.broadcast(
          {
            type: 'playerJoined',
            payload: { player },
          },
          { exclude: activeController },
        )
      },
      afterLeave: (player) => {
        const activeController = controllerRef.current
        if (!activeController) {
          return
        }
        host.runtime.broadcast(
          {
            type: 'playerLeft',
            payload: {
              playerEntityId: player.entityId,
              playerName: player.name,
            },
          },
          { exclude: activeController },
        )
      },
    },
    adapter,
  )
  controllerRef.current = controller
  const unregisterJoinServer = adapter.eventBus.on('joinServer', async ({ playerName }) =>
    controller.join(playerName),
  )
  host.runtime.registerSession(controller)
  const unsubscribers = registerRuntimeHandlers(client, runtime)

  return {
    client,
    runtime,
    controller,
    cleanup: async () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe()
      }
      await controller.disconnect()
      unregisterJoinServer()
      host.runtime.unregisterSession(controller)
      controller.dispose()
      client.close()
    },
  }
}

test('dedicated multiplayer sessions share one generated world and only support joinServer', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-dedicated-'))
  const storage = new DedicatedWorldStorage(rootDir)

  try {
    const world = await loadOrCreateDedicatedWorld(storage, {
      worldName: 'Server World',
      seed: 77,
    })
    const worlds = await storage.listWorlds()
    expect(worlds).toHaveLength(1)
    expect(worlds[0]?.name).toBe('Server World')
    expect(worlds[0]?.seed).toBe(77)
    const dedicatedWorldDir = await stat(join(rootDir, DEDICATED_WORLD_DIRECTORY_NAME))
    expect(dedicatedWorldDir.isDirectory()).toBe(true)
    await expect(stat(join(rootDir, 'worlds'))).rejects.toBeDefined()
    await expect(stat(join(rootDir, 'registry.bin'))).rejects.toBeDefined()

    const runtime = new ServerRuntime(null, world, {
      autoStart: false,
    })

    const host: DedicatedServerSessionHost = {
      world,
      runtime,
      contextLabel: 'server',
    }

    const alice = createDedicatedSessionHarness(host)
    const bob = createDedicatedSessionHarness(host)
    let remoteLoadingProgressEvents = 0
    alice.client.eventBus.on('loadingProgress', () => {
      remoteLoadingProgressEvents += 1
    })

    try {
      const aliceJoined = await alice.client.eventBus.send({
        type: 'joinServer',
        payload: {
          playerName: 'Alice',
        },
      })
      alice.runtime.reset()
      alice.runtime.applyJoinedWorld(aliceJoined)

      expect(aliceJoined.world.name).toBe('Server World')
      expect(aliceJoined.world.seed).toBe(77)
      expect(aliceJoined.clientPlayer.name).toBe('Alice')
      expect(aliceJoined.players).toEqual([])
      expect(remoteLoadingProgressEvents).toBe(0)

      const coords = [{ x: 0, z: 0 }]
      await alice.runtime.requestMissingChunks(coords)
      await alice.runtime.waitForChunks(coords)
      expect(alice.runtime.world.hasChunk(coords[0]!)).toBe(true)

      const bobJoined = await bob.client.eventBus.send({
        type: 'joinServer',
        payload: {
          playerName: 'Bob',
        },
      })
      bob.runtime.reset()
      bob.runtime.applyJoinedWorld(bobJoined)

      expect(bobJoined.world.name).toBe('Server World')
      expect(bobJoined.players.map((player) => player.name)).toContain('Alice')
      expect(bobJoined.clientPlayer.name).toBe('Bob')

      await expect(
        bob.client.eventBus.send({
          type: 'joinWorld',
          payload: {
            playerName: 'Bob',
          },
        }),
      ).rejects.toThrow('Unknown request type "joinWorld".')
    } finally {
      await bob.cleanup()
      await alice.cleanup()
      await runtime.shutdown()
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})
