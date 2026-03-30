import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  ClientToServerMessage,
  LoadingProgressPayload,
  ServerToClientMessage,
} from '../packages/core/src/shared/messages.ts'

import { PortClientAdapter } from '../apps/client/src/app/client-adapter.ts'
import { ClientWorldRuntime } from '../apps/client/src/app/world-runtime.ts'
import { AuthoritativeWorld } from '../packages/core/src/server/authoritative-world.ts'
import { ServerRuntime } from '../packages/core/src/server/runtime.ts'
import { PortServerAdapter } from '../packages/core/src/server/server-adapter.ts'
import { BinaryWorldStorage } from '../packages/core/src/server/world-storage.ts'
import { createInMemoryTransportPair } from '../packages/core/src/shared/transport.ts'
import { BLOCK_IDS, getDroppedItemIdForBlock } from '../packages/core/src/world/blocks.ts'
import {
  DEFAULT_INVENTORY_STACK_SIZE,
  getHotbarInventorySlots,
  getInventoryCount,
  getMainInventorySlotIndex,
  getMainInventorySlots,
} from '../packages/core/src/world/inventory.ts'
import { ITEM_IDS } from '../packages/core/src/world/items.ts'
import { getTerrainHeight } from '../packages/core/src/world/terrain.ts'
import { worldToChunkCoord } from '../packages/core/src/world/world.ts'
import { createTestStarterInventory } from './helpers/test-inventory.ts'

const PLAYER_NAME = 'Alice'
const SERVER_TICK_WAIT_MS = 25

const createHarness = async (): Promise<{
  rootDir: string
  transport: ReturnType<
    typeof createInMemoryTransportPair<
      ServerToClientMessage,
      ClientToServerMessage,
      ClientToServerMessage,
      ServerToClientMessage
    >
  >
  client: PortClientAdapter
  worldRuntime: ClientWorldRuntime
  serverRuntime: ServerRuntime
  loadingProgressEvents: LoadingProgressPayload[]
  advance: (elapsedMs?: number) => Promise<void>
}> => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-runtime-'))
  const transport = createInMemoryTransportPair<
    ServerToClientMessage,
    ClientToServerMessage,
    ClientToServerMessage,
    ServerToClientMessage
  >()
  const client = new PortClientAdapter(transport.left)
  const server = new PortServerAdapter(transport.right)
  const worldRuntime = new ClientWorldRuntime(client)
  const loadingProgressEvents: LoadingProgressPayload[] = []
  const storage = new BinaryWorldStorage(rootDir)
  const worldRecord = await storage.createWorld('Alpha', 42)
  let nowMs = 0
  const serverRuntime = new ServerRuntime(
    server,
    new AuthoritativeWorld(worldRecord, storage, { createInventory: createTestStarterInventory }),
    {
      tickIntervalMs: 10,
      maxCatchUpTicks: 100,
      autoSaveIntervalTicks: 10,
      autoStart: false,
      now: () => nowMs,
    },
  )

  client.eventBus.on('chunkDelivered', ({ chunk }) => {
    worldRuntime.applyChunk(chunk)
  })
  client.eventBus.on('chunkChanged', ({ chunk }) => {
    worldRuntime.applyChunk(chunk)
  })
  client.eventBus.on('inventoryUpdated', ({ playerEntityId, inventory }) => {
    if (playerEntityId === worldRuntime.clientPlayerEntityId) {
      worldRuntime.applyInventory(inventory)
    }
  })
  client.eventBus.on('containerUpdated', ({ playerEntityId, container }) => {
    if (playerEntityId === worldRuntime.clientPlayerEntityId) {
      worldRuntime.applyOpenContainer(container)
    }
  })
  client.eventBus.on('droppedItemSpawned', ({ item }) => {
    worldRuntime.applyDroppedItem(item)
  })
  client.eventBus.on('droppedItemUpdated', ({ item }) => {
    worldRuntime.applyDroppedItem(item)
  })
  client.eventBus.on('droppedItemRemoved', ({ entityId }) => {
    worldRuntime.removeDroppedItem(entityId)
  })
  client.eventBus.on('playerJoined', ({ player }) => {
    worldRuntime.applyPlayer(player)
  })
  client.eventBus.on('playerUpdated', ({ player }) => {
    worldRuntime.applyPlayer(player)
  })
  client.eventBus.on('playerLeft', ({ playerEntityId, playerName }) => {
    worldRuntime.removePlayer(playerEntityId, playerName)
  })
  client.eventBus.on('pigUpdated', ({ pig }) => {
    worldRuntime.applyPig(pig)
  })
  client.eventBus.on('chatMessage', ({ entry }) => {
    worldRuntime.appendChatMessage(entry)
  })
  client.eventBus.on('worldTimeUpdated', ({ worldTime }) => {
    worldRuntime.applyWorldTime(worldTime)
  })
  client.eventBus.on('loadingProgress', (payload) => {
    loadingProgressEvents.push(payload)
  })

  return {
    rootDir,
    transport,
    client,
    worldRuntime,
    serverRuntime,
    loadingProgressEvents,
    advance: async (elapsedMs = SERVER_TICK_WAIT_MS) => {
      nowMs += elapsedMs
      await serverRuntime.processPendingTicks(nowMs)
    },
  }
}

test('client/server request-response correlation and error events work', async () => {
  const harness = await createHarness()

  try {
    const joined = await harness.client.eventBus.send({
      type: 'joinWorld',
      payload: {
        playerName: PLAYER_NAME,
      },
    })
    expect(joined.world.name).toBe('Alpha')
    expect(harness.loadingProgressEvents.length).toBeGreaterThan(0)
    expect(harness.loadingProgressEvents[0]?.stage).toBe('preparing-world')
    expect(harness.loadingProgressEvents.at(-1)?.stage).toBe('ready')
    for (let index = 1; index < harness.loadingProgressEvents.length; index += 1) {
      expect(harness.loadingProgressEvents[index]!.completedUnits).toBeGreaterThanOrEqual(
        harness.loadingProgressEvents[index - 1]!.completedUnits,
      )
    }

    let serverErrorMessage = ''
    harness.client.eventBus.on('serverError', ({ message }) => {
      serverErrorMessage = message
    })

    harness.transport.left.postMessage({
      kind: 'request',
      id: 'invalid-request',
      type: 'unknownRequest',
      payload: {},
    } as never)
    await Bun.sleep(0)
    expect(serverErrorMessage).toContain('Unknown request type')
  } finally {
    await harness.serverRuntime.shutdown()
    harness.client.close()
    await rm(harness.rootDir, { recursive: true, force: true })
  }
})

test('client/server replicates pigs from join payloads and movement updates', async () => {
  const harness = await createHarness()

  try {
    const joined = await harness.client.eventBus.send({
      type: 'joinWorld',
      payload: {
        playerName: PLAYER_NAME,
      },
    })
    harness.worldRuntime.reset()
    harness.worldRuntime.applyJoinedWorld(joined)

    expect(harness.worldRuntime.pigs.size).toBeGreaterThan(0)
    const initialPositions = new Map(
      [...harness.worldRuntime.pigs.values()].map((pig) => [
        pig.entityId,
        [...pig.state.position] as [number, number, number],
      ]),
    )

    let moved = false
    for (let tick = 0; tick < 40 && !moved; tick += 1) {
      await harness.advance(250)
      moved = [...harness.worldRuntime.pigs.values()].some((pig) => {
        const initial = initialPositions.get(pig.entityId)
        return (
          initial !== undefined &&
          (initial[0] !== pig.state.position[0] ||
            initial[1] !== pig.state.position[1] ||
            initial[2] !== pig.state.position[2])
        )
      })
    }

    expect(moved).toBe(true)
  } finally {
    await harness.serverRuntime.shutdown()
    harness.client.close()
    await rm(harness.rootDir, { recursive: true, force: true })
  }
})

test('client/server player crafting stays authoritative', async () => {
  const harness = await createHarness()

  try {
    const joined = await harness.client.eventBus.send({
      type: 'joinWorld',
      payload: {
        playerName: PLAYER_NAME,
      },
    })
    harness.worldRuntime.reset()
    harness.worldRuntime.applyJoinedWorld(joined)

    harness.client.eventBus.send({
      type: 'interactInventorySlot',
      payload: {
        slot: 4,
      },
    })
    await harness.advance()
    expect(harness.worldRuntime.inventory.cursor).toEqual({ itemId: ITEM_IDS.log, count: 64 })

    harness.client.eventBus.send({
      type: 'interactPlayerCraftingSlot',
      payload: {
        slot: 0,
      },
    })
    await harness.advance()
    expect(harness.worldRuntime.inventory.cursor).toEqual({ itemId: ITEM_IDS.log, count: 63 })
    expect(harness.worldRuntime.inventory.playerCraftingInput?.[0]).toEqual({
      itemId: ITEM_IDS.log,
      count: 1,
    })

    harness.client.eventBus.send({
      type: 'interactInventorySlot',
      payload: {
        slot: 4,
      },
    })
    await harness.advance()
    expect(harness.worldRuntime.inventory.cursor).toBeNull()

    harness.client.eventBus.send({
      type: 'takePlayerCraftingResult',
      payload: {},
    })
    await harness.advance()
    expect(harness.worldRuntime.inventory.cursor).toEqual({ itemId: ITEM_IDS.planks, count: 4 })
    expect(harness.worldRuntime.inventory.playerCraftingInput?.[0]).toEqual({
      itemId: ITEM_IDS.empty,
      count: 0,
    })
  } finally {
    await harness.serverRuntime.shutdown()
    await rm(harness.rootDir, { recursive: true, force: true })
  }
})

test('/give adds items by key name with default amount', async () => {
  const harness = await createHarness()

  try {
    const joined = await harness.client.eventBus.send({
      type: 'joinWorld',
      payload: { playerName: PLAYER_NAME },
    })
    harness.worldRuntime.reset()
    harness.worldRuntime.applyJoinedWorld(joined)

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: { text: '/give stone' },
    })
    await Bun.sleep(0)

    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toBe('Gave 64 x stone.')
    // Starter already has 64 stone (full stack); give adds another full stack.
    const stoneCount = harness.worldRuntime.inventory.slots
      .filter((s) => s.itemId === ITEM_IDS.stone)
      .reduce((sum, s) => sum + s.count, 0)
    expect(stoneCount).toBe(128)
  } finally {
    await harness.serverRuntime.shutdown()
    harness.client.close()
    await rm(harness.rootDir, { recursive: true, force: true })
  }
})

test('/give adds items by numeric ID with explicit amount', async () => {
  const harness = await createHarness()

  try {
    const joined = await harness.client.eventBus.send({
      type: 'joinWorld',
      payload: { playerName: PLAYER_NAME },
    })
    harness.worldRuntime.reset()
    harness.worldRuntime.applyJoinedWorld(joined)

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: { text: '/give 103 10' },
    })
    await Bun.sleep(0)

    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toBe('Gave 10 x 103.')
    // Starter already has 64 stone; give adds 10 more in a new slot.
    const stoneCount = harness.worldRuntime.inventory.slots
      .filter((s) => s.itemId === ITEM_IDS.stone)
      .reduce((sum, s) => sum + s.count, 0)
    expect(stoneCount).toBe(74)
  } finally {
    await harness.serverRuntime.shutdown()
    harness.client.close()
    await rm(harness.rootDir, { recursive: true, force: true })
  }
})

test('/give rejects unknown item names and invalid amounts', async () => {
  const harness = await createHarness()

  try {
    const joined = await harness.client.eventBus.send({
      type: 'joinWorld',
      payload: { playerName: PLAYER_NAME },
    })
    harness.worldRuntime.reset()
    harness.worldRuntime.applyJoinedWorld(joined)

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: { text: '/give notanitem' },
    })
    await Bun.sleep(0)
    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toBe('Unknown item: notanitem')

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: { text: '/give stone -5' },
    })
    await Bun.sleep(0)
    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toBe(
      'Amount must be a positive integer.',
    )

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: { text: '/give' },
    })
    await Bun.sleep(0)
    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toBe('Usage: /give <key|id> [amount]')
  } finally {
    await harness.serverRuntime.shutdown()
    harness.client.close()
    await rm(harness.rootDir, { recursive: true, force: true })
  }
})

test('authoritative chunk delivery and mutation updates the replicated client world', async () => {
  const harness = await createHarness()

  try {
    const joined = await harness.client.eventBus.send({
      type: 'joinWorld',
      payload: {
        playerName: PLAYER_NAME,
      },
    })
    expect(harness.loadingProgressEvents.at(-1)?.stage).toBe('ready')
    harness.worldRuntime.reset()
    harness.worldRuntime.applyJoinedWorld(joined)

    const targetY = getTerrainHeight(joined.world.seed, 1, 1)
    const coords = [worldToChunkCoord(1, targetY, 1).chunk]
    await harness.worldRuntime.requestMissingChunks(coords)
    await harness.worldRuntime.waitForChunks(coords)

    expect(harness.worldRuntime.world.hasChunk(coords[0]!)).toBe(true)
    expect(joined.clientPlayerName).toBe(PLAYER_NAME)
    expect(joined.clientPlayer.entityId).toMatch(/^player:/)
    expect(harness.worldRuntime.clientPlayerName).toBe(PLAYER_NAME)
    expect(harness.worldRuntime.clientPlayerEntityId).toBe(joined.clientPlayer.entityId)
    expect(harness.worldRuntime.getClientPlayer()?.name).toBe(PLAYER_NAME)
    expect(harness.worldRuntime.getClientPlayer()?.entityId).toBe(joined.clientPlayer.entityId)
    expect(joined.droppedItems).toEqual([])
    expect(harness.worldRuntime.droppedItems.size).toBe(0)
    expect(harness.worldRuntime.inventory.selectedSlot).toBe(0)
    expect(getHotbarInventorySlots(harness.worldRuntime.inventory)[1]).toEqual({
      itemId: ITEM_IDS.glowstone,
      count: DEFAULT_INVENTORY_STACK_SIZE,
    })
    expect(getHotbarInventorySlots(harness.worldRuntime.inventory)[6]).toEqual({
      itemId: ITEM_IDS.empty,
      count: 0,
    })
    expect(getMainInventorySlots(harness.worldRuntime.inventory)[0]).toEqual({
      itemId: ITEM_IDS.glass,
      count: DEFAULT_INVENTORY_STACK_SIZE,
    })
    expect(
      getMainInventorySlots(harness.worldRuntime.inventory)
        .slice(1)
        .every((slot) => slot.itemId === ITEM_IDS.empty && slot.count === 0),
    ).toBe(true)

    const targetBlockId = harness.worldRuntime.world.getBlock(1, targetY, 1)
    const targetItemId = getDroppedItemIdForBlock(targetBlockId)
    expect(targetBlockId).not.toBe(BLOCK_IDS.air)
    expect(targetItemId).not.toBeNull()
    const initialTargetItemCount = getInventoryCount(harness.worldRuntime.inventory, targetItemId!)

    let changedChunkReceived = false
    harness.client.eventBus.on('chunkChanged', () => {
      changedChunkReceived = true
    })

    harness.client.eventBus.send({
      type: 'updatePlayerState',
      payload: {
        state: {
          position: [14, joined.clientPlayer.state.position[1], -6],
          yaw: 0.5,
          pitch: -0.2,
        },
        flying: false,
      },
    })
    await harness.advance()
    expect(harness.worldRuntime.getClientPlayer()?.state.position).toEqual([
      14,
      joined.clientPlayer.state.position[1],
      -6,
    ])

    harness.client.eventBus.send({
      type: 'mutateBlock',
      payload: {
        x: 1,
        y: targetY,
        z: 1,
        blockId: BLOCK_IDS.air,
      },
    })
    await harness.advance()

    expect(changedChunkReceived).toBe(true)
    expect(harness.worldRuntime.world.getBlock(1, targetY, 1)).toBe(BLOCK_IDS.air)
    expect(getMainInventorySlots(harness.worldRuntime.inventory)[0]).toEqual({
      itemId: ITEM_IDS.glass,
      count: DEFAULT_INVENTORY_STACK_SIZE,
    })
    expect(
      getMainInventorySlots(harness.worldRuntime.inventory)
        .slice(1)
        .every((slot) => slot.itemId === ITEM_IDS.empty && slot.count === 0),
    ).toBe(true)
    expect(harness.worldRuntime.droppedItems.size).toBe(1)

    await harness.advance(300)
    const droppedItem = [...harness.worldRuntime.droppedItems.values()][0]
    expect(droppedItem).toBeDefined()
    harness.client.eventBus.send({
      type: 'updatePlayerState',
      payload: {
        state: {
          position: [
            droppedItem!.position[0],
            Math.max(droppedItem!.position[1] - 0.9, 0),
            droppedItem!.position[2],
          ],
          yaw: 0.5,
          pitch: -0.2,
        },
        flying: false,
      },
    })
    await harness.advance()

    expect(getInventoryCount(harness.worldRuntime.inventory, targetItemId!)).toBe(
      initialTargetItemCount + 1,
    )
    expect(harness.worldRuntime.droppedItems.size).toBe(0)

    const collectedSlotIndex = getHotbarInventorySlots(harness.worldRuntime.inventory).findIndex(
      (slot) => slot.itemId === targetItemId,
    )
    expect(collectedSlotIndex).toBeGreaterThanOrEqual(0)
    harness.client.eventBus.send({
      type: 'selectInventorySlot',
      payload: {
        slot: collectedSlotIndex,
      },
    })
    await harness.advance()
    expect(harness.worldRuntime.inventory.selectedSlot).toBe(collectedSlotIndex)

    harness.client.eventBus.send({
      type: 'interactInventorySlot',
      payload: {
        slot: getMainInventorySlotIndex(0),
      },
    })
    await harness.advance()
    expect(harness.worldRuntime.inventory.cursor).toEqual({ itemId: ITEM_IDS.glass, count: 64 })

    harness.client.eventBus.send({
      type: 'interactInventorySlot',
      payload: {
        slot: getMainInventorySlotIndex(2),
      },
    })
    await harness.advance()
    expect(harness.worldRuntime.inventory.cursor).toBeNull()
    expect(getMainInventorySlots(harness.worldRuntime.inventory)[2]).toEqual({
      itemId: ITEM_IDS.glass,
      count: 64,
    })

    harness.client.eventBus.send({
      type: 'interactInventorySlot',
      payload: {
        slot: getMainInventorySlotIndex(2),
      },
    })
    await harness.advance()
    harness.client.eventBus.send({
      type: 'interactInventorySlot',
      payload: {
        slot: 8,
      },
    })
    await harness.advance()
    expect(getHotbarInventorySlots(harness.worldRuntime.inventory)[8]).toEqual({
      itemId: ITEM_IDS.glass,
      count: 64,
    })
    expect(harness.worldRuntime.inventory.cursor).toEqual({
      itemId: ITEM_IDS.cobblestone,
      count: 64,
    })

    harness.client.eventBus.send({
      type: 'selectInventorySlot',
      payload: {
        slot: 8,
      },
    })
    await harness.advance()
    expect(harness.worldRuntime.inventory.selectedSlot).toBe(8)

    harness.client.eventBus.send({
      type: 'selectInventorySlot',
      payload: {
        slot: collectedSlotIndex,
      },
    })
    await harness.advance()
    expect(harness.worldRuntime.inventory.selectedSlot).toBe(collectedSlotIndex)

    harness.client.eventBus.send({
      type: 'mutateBlock',
      payload: {
        x: 1,
        y: targetY,
        z: 1,
        blockId: targetBlockId,
      },
    })
    await harness.advance()

    expect(harness.worldRuntime.world.getBlock(1, targetY, 1)).toBe(targetBlockId)
    expect(getInventoryCount(harness.worldRuntime.inventory, targetItemId!)).toBe(
      initialTargetItemCount,
    )

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: {
        text: '/gamemode 1',
      },
    })
    await Bun.sleep(0)
    expect(harness.worldRuntime.getClientPlayer()?.gamemode).toBe(1)
    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toContain('creative')

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: {
        text: '/timeset night',
      },
    })
    await Bun.sleep(0)
    expect(harness.worldRuntime.worldTime.timeOfDayTicks).toBe(13_000)
    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toContain('Time set')

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: {
        text: '/seed',
      },
    })
    await Bun.sleep(0)
    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toContain('World seed: 42')

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: {
        text: '/teleport 20 80 -6',
      },
    })
    await Bun.sleep(0)
    expect(harness.worldRuntime.getClientPlayer()?.state.position).toEqual([20, 80, -6])
    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toContain('Teleported to X:20 Y:80 Z:-6')

    const saveResult = await harness.client.eventBus.send({
      type: 'saveWorld',
      payload: {},
    })
    await Bun.sleep(0)
    expect(saveResult.world.name).toBe('Alpha')
    expect(harness.worldRuntime.chatMessages.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'system',
        text: expect.stringMatching(/^SAVED Alpha \(\d+ CHUNKS\)$/),
      }),
    )

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: {
        text: '/save',
      },
    })
    await Bun.sleep(0)
    expect(harness.worldRuntime.chatMessages.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'system',
        text: expect.stringMatching(/^SAVED Alpha \(\d+ CHUNKS\)$/),
      }),
    )

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: {
        text: 'hello world',
      },
    })
    await Bun.sleep(0)
    expect(harness.worldRuntime.chatMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'player',
          senderName: PLAYER_NAME,
          text: 'hello world',
        }),
      ]),
    )

    await harness.advance(100)
    expect(harness.worldRuntime.chatMessages.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'system',
        text: expect.stringMatching(/^AUTO SAVED Alpha \(\d+ CHUNKS\)$/),
      }),
    )
  } finally {
    await harness.serverRuntime.shutdown()
    harness.client.close()
    await rm(harness.rootDir, { recursive: true, force: true })
  }
})

test('server handles crafting table use through the authoritative tick', async () => {
  const harness = await createHarness()

  try {
    const joined = await harness.client.eventBus.send({
      type: 'joinWorld',
      payload: { playerName: PLAYER_NAME },
    })
    harness.worldRuntime.reset()
    harness.worldRuntime.applyJoinedWorld(joined)

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: { text: '/give craftingTable 1' },
    })
    await Bun.sleep(0)

    const craftingTableSlot = harness.worldRuntime.inventory.slots.findIndex(
      (slot) => slot.itemId === ITEM_IDS.craftingTable,
    )
    expect(craftingTableSlot).toBeGreaterThanOrEqual(0)

    harness.client.eventBus.send({
      type: 'selectInventorySlot',
      payload: { slot: craftingTableSlot },
    })
    await harness.advance()

    const targetX = 1
    const targetZ = 1
    const targetY = getTerrainHeight(joined.world.seed, targetX, targetZ) + 1

    harness.client.eventBus.send({
      type: 'mutateBlock',
      payload: {
        x: targetX,
        y: targetY,
        z: targetZ,
        blockId: BLOCK_IDS.craftingTable,
      },
    })
    await harness.advance()

    expect(harness.worldRuntime.world.getBlock(targetX, targetY, targetZ)).toBe(
      BLOCK_IDS.craftingTable,
    )

    harness.client.eventBus.send({
      type: 'useBlock',
      payload: {
        x: targetX,
        y: targetY,
        z: targetZ,
      },
    })
    await harness.advance()

    expect(harness.worldRuntime.openContainer).toEqual(
      expect.objectContaining({
        kind: 'craftingTable',
      }),
    )
  } finally {
    await harness.serverRuntime.shutdown()
    harness.client.close()
    await rm(harness.rootDir, { recursive: true, force: true })
  }
})

test('inventory browser grants stacks in both survival and creative mode', async () => {
  const harness = await createHarness()

  try {
    const joined = await harness.client.eventBus.send({
      type: 'joinWorld',
      payload: { playerName: PLAYER_NAME },
    })
    harness.worldRuntime.reset()
    harness.worldRuntime.applyJoinedWorld(joined)

    expect(harness.worldRuntime.getClientPlayer()?.gamemode).toBe(0)
    expect(getInventoryCount(harness.worldRuntime.inventory, ITEM_IDS.diamondOre)).toBe(0)

    harness.client.eventBus.send({
      type: 'requestInventoryBrowserItem',
      payload: { itemId: ITEM_IDS.diamondOre },
    })
    await harness.advance()

    expect(getInventoryCount(harness.worldRuntime.inventory, ITEM_IDS.diamondOre)).toBe(64)
    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toBe('Added 64 x DIAMOND ORE.')

    harness.client.eventBus.send({
      type: 'submitChat',
      payload: {
        text: '/gamemode 1',
      },
    })
    await Bun.sleep(0)
    expect(harness.worldRuntime.getClientPlayer()?.gamemode).toBe(1)

    harness.client.eventBus.send({
      type: 'requestInventoryBrowserItem',
      payload: { itemId: ITEM_IDS.diamondOre },
    })
    await harness.advance()

    expect(getInventoryCount(harness.worldRuntime.inventory, ITEM_IDS.diamondOre)).toBe(128)
    expect(harness.worldRuntime.chatMessages.at(-1)?.text).toBe('Added 64 x DIAMOND ORE.')
  } finally {
    await harness.serverRuntime.shutdown()
    harness.client.close()
    await rm(harness.rootDir, { recursive: true, force: true })
  }
})
