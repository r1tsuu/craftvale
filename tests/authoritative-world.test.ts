import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BlockId } from '../packages/core/src/types.ts'

import { AuthoritativeWorld } from '../packages/core/src/server/authoritative-world.ts'
import { BinaryWorldStorage } from '../packages/core/src/server/world-storage.ts'
import { BLOCK_IDS, getDroppedItemIdForBlock } from '../packages/core/src/world/blocks.ts'
import { Chunk } from '../packages/core/src/world/chunk.ts'
import { CHUNK_SIZE, WORLD_SEA_LEVEL } from '../packages/core/src/world/constants.ts'
import {
  getMainInventorySlotIndex,
  getMainInventorySlots,
} from '../packages/core/src/world/inventory.ts'
import { ITEM_IDS } from '../packages/core/src/world/items.ts'
import { getTerrainHeight } from '../packages/core/src/world/terrain.ts'
import { worldToChunkCoord } from '../packages/core/src/world/world.ts'
import { createTestStarterInventory } from './helpers/test-inventory.ts'

const PLAYER_A = 'Alice'
const PLAYER_B = 'Bob'

const getChunkLocalIndex = (worldX: number, worldY: number, worldZ: number): number => {
  const coords = worldToChunkCoord(worldX, worldY, worldZ)
  return coords.local.x + coords.local.z * CHUNK_SIZE + coords.local.y * CHUNK_SIZE * CHUNK_SIZE
}

test('authoritative world keeps per-player state separate and persists it by player name', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('Alpha', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })

    const joinedA = await world.joinPlayer(PLAYER_A)
    expect(joinedA.clientPlayer.name).toBe(PLAYER_A)
    expect(joinedA.players).toEqual([])
    expect(joinedA.droppedItems).toEqual([])
    expect(joinedA.clientPlayer.gamemode).toBe(0)
    expect(joinedA.clientPlayer.entityId).toMatch(/^player:/)

    await world.setPlayerGamemode(joinedA.clientPlayer.entityId, 1)
    await world.updatePlayerState(
      joinedA.clientPlayer.entityId,
      {
        position: [20, 80, -4],
        yaw: 0.75,
        pitch: -0.2,
      },
      true,
    )
    const playerAInventory = await world.selectInventorySlot(joinedA.clientPlayer.entityId, 4)
    expect(playerAInventory.selectedSlot).toBe(4)
    const liftedStack = await world.interactInventorySlot(
      joinedA.clientPlayer.entityId,
      getMainInventorySlotIndex(0),
    )
    expect(liftedStack.cursor).toEqual({ itemId: ITEM_IDS.glass, count: 64 })
    const placedStack = await world.interactInventorySlot(
      joinedA.clientPlayer.entityId,
      getMainInventorySlotIndex(1),
    )
    expect(placedStack.cursor).toBeNull()
    expect(getMainInventorySlots(placedStack)[1]).toEqual({ itemId: ITEM_IDS.glass, count: 64 })

    const joinedB = await world.joinPlayer(PLAYER_B)
    expect(joinedB.clientPlayer.name).toBe(PLAYER_B)
    expect(joinedB.players.map((player) => player.name)).toEqual([PLAYER_A])
    expect(joinedB.inventory.selectedSlot).toBe(0)
    expect(joinedB.clientPlayer.entityId).not.toBe(joinedA.clientPlayer.entityId)

    await world.save()
    await world.leavePlayer(joinedA.clientPlayer.entityId)
    await world.leavePlayer(joinedB.clientPlayer.entityId)

    const reloadedRecord = await storage.getWorld('Alpha')
    expect(reloadedRecord).not.toBeNull()
    const reloadedWorld = new AuthoritativeWorld(reloadedRecord!, storage, {
      createInventory: createTestStarterInventory,
    })

    const rejoinedA = await reloadedWorld.joinPlayer(PLAYER_A)
    expect(rejoinedA.clientPlayer.entityId).toBe(joinedA.clientPlayer.entityId)
    expect(rejoinedA.clientPlayer.state.position).toEqual([20, 80, -4])
    expect(rejoinedA.clientPlayer.state.yaw).toBe(0.75)
    expect(rejoinedA.clientPlayer.gamemode).toBe(1)
    expect(rejoinedA.clientPlayer.flying).toBe(false)
    expect(rejoinedA.inventory.selectedSlot).toBe(4)
    expect(getMainInventorySlots(rejoinedA.inventory)[1]).toEqual({
      itemId: ITEM_IDS.glass,
      count: 64,
    })

    const rejoinedB = await reloadedWorld.joinPlayer(PLAYER_B)
    expect(rejoinedB.clientPlayer.entityId).toBe(joinedB.clientPlayer.entityId)
    expect(rejoinedB.clientPlayer.state.position).not.toEqual([20, 80, -4])
    expect(rejoinedB.inventory.selectedSlot).toBe(0)
    expect(rejoinedB.players.map((player) => player.name)).toEqual([PLAYER_A])
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('authoritative world spawns and persists dropped items until players pick them up', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-drops-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('Drops', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)

    const targetX = 1
    const targetZ = 1
    const targetY = getTerrainHeight(worldRecord.seed, targetX, targetZ)
    const targetCoords = worldToChunkCoord(targetX, targetY, targetZ)
    const chunk = await world.getChunkPayload(targetCoords.chunk)
    const localIndex = getChunkLocalIndex(targetX, targetY, targetZ)
    const blockId = chunk.blocks[localIndex] as BlockId
    expect(blockId).not.toBe(BLOCK_IDS.air)
    const droppedItemId = getDroppedItemIdForBlock(blockId)
    expect(droppedItemId).not.toBeNull()

    const broken = await world.applyBlockMutation(
      joined.clientPlayer.entityId,
      targetX,
      targetY,
      targetZ,
      BLOCK_IDS.air,
    )
    expect(broken.inventoryChanged).toBe(false)
    expect(broken.droppedItems.spawnedDroppedItems).toHaveLength(1)
    expect(broken.droppedItems.spawnedDroppedItems[0]?.itemId).toBe(droppedItemId!)

    await world.save()

    const reloadedRecord = await storage.getWorld('Drops')
    expect(reloadedRecord).not.toBeNull()
    const reloadedWorld = new AuthoritativeWorld(reloadedRecord!, storage, {
      createInventory: createTestStarterInventory,
    })
    const rejoined = await reloadedWorld.joinPlayer(PLAYER_A)
    expect(rejoined.droppedItems).toHaveLength(1)
    expect(rejoined.droppedItems[0]?.itemId).toBe(droppedItemId!)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('authoritative world pregenerates and persists the startup chunk set', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-startup-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('Startup', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const expectedCoords = world.getStartupChunkCoords()
    const progress: Array<{ completedChunks: number; totalChunks: number }> = []

    const pregenerated = await world.pregenerateStartupArea(
      world.spawnPosition,
      undefined,
      (update) => {
        progress.push(update)
      },
    )

    expect(pregenerated.coords).toEqual(expectedCoords)
    expect(pregenerated.savedChunks).toBe(expectedCoords.length)
    expect(progress[0]).toEqual({
      completedChunks: 0,
      totalChunks: expectedCoords.length,
    })
    expect(progress.at(-1)).toEqual({
      completedChunks: expectedCoords.length,
      totalChunks: expectedCoords.length,
    })

    for (const coord of expectedCoords) {
      await expect(storage.loadChunk(worldRecord.name, coord)).resolves.toEqual(
        expect.objectContaining({
          coord,
        }),
      )
    }

    const secondPass = await world.pregenerateStartupArea()
    expect(secondPass.savedChunks).toBe(0)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('survival cannot break bedrock but creative can', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-bedrock-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('Bedrock', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)
    const targetIndex = 1 + 1 * CHUNK_SIZE + 0 * CHUNK_SIZE * CHUNK_SIZE

    const survivalAttempt = await world.applyBlockMutation(joined.clientPlayer.entityId, 1, 0, 1, 0)
    expect(survivalAttempt.changedChunks).toEqual([])
    expect(survivalAttempt.droppedItems.spawnedDroppedItems).toEqual([])

    const unchangedChunk = await world.getChunkPayload({ x: 0, z: 0 })
    expect(unchangedChunk.blocks[targetIndex]).toBe(10)

    await world.setPlayerGamemode(joined.clientPlayer.entityId, 1)
    const creativeAttempt = await world.applyBlockMutation(joined.clientPlayer.entityId, 1, 0, 1, 0)
    expect(creativeAttempt.changedChunks).toHaveLength(1)
    expect(creativeAttempt.droppedItems.spawnedDroppedItems).toEqual([])

    const changedChunk = await world.getChunkPayload({ x: 0, z: 0 })
    expect(changedChunk.blocks[targetIndex]).toBe(0)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('creative block mutations neither spawn drops nor consume held items', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-creative-items-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('CreativeItems', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)
    await world.setPlayerGamemode(joined.clientPlayer.entityId, 1)

    const targetX = 1
    const targetZ = 1
    const targetY = getTerrainHeight(worldRecord.seed, targetX, targetZ)
    const targetCoords = worldToChunkCoord(targetX, targetY, targetZ)
    const chunk = await world.getChunkPayload(targetCoords.chunk)
    const localIndex = getChunkLocalIndex(targetX, targetY, targetZ)
    const blockId = chunk.blocks[localIndex] as BlockId
    expect(blockId).not.toBe(BLOCK_IDS.air)

    const broken = await world.applyBlockMutation(
      joined.clientPlayer.entityId,
      targetX,
      targetY,
      targetZ,
      BLOCK_IDS.air,
    )
    expect(broken.changedChunks).toHaveLength(1)
    expect(broken.droppedItems.spawnedDroppedItems).toEqual([])
    expect(broken.inventoryChanged).toBe(false)

    const afterBreakChunk = await world.getChunkPayload(targetCoords.chunk)
    expect(afterBreakChunk.blocks[localIndex]).toBe(BLOCK_IDS.air)

    const selectedBeforePlace = joined.inventory.slots[0]
    const placed = await world.applyBlockMutation(
      joined.clientPlayer.entityId,
      targetX,
      targetY,
      targetZ,
      BLOCK_IDS.grass,
    )
    expect(placed.changedChunks).toHaveLength(1)
    expect(placed.inventoryChanged).toBe(false)
    expect(placed.inventory.slots[0]).toEqual(selectedBeforePlace)

    const afterPlaceChunk = await world.getChunkPayload(targetCoords.chunk)
    expect(afterPlaceChunk.blocks[localIndex]).toBe(BLOCK_IDS.grass)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('placing a solid block into water replaces the water cell', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-water-replace-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('WaterReplace', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)

    let targetX = 0
    let targetZ = 0
    let targetY = 0
    let found = false
    for (let worldZ = -32; worldZ <= 32 && !found; worldZ += 1) {
      for (let worldX = -32; worldX <= 32; worldX += 1) {
        const height = getTerrainHeight(worldRecord.seed, worldX, worldZ)
        if (height >= WORLD_SEA_LEVEL) {
          continue
        }

        const targetCoords = worldToChunkCoord(worldX, height + 1, worldZ)
        const block = world.getChunkPayload(targetCoords.chunk).then((chunk) => {
          const localIndex = getChunkLocalIndex(worldX, height + 1, worldZ)
          return chunk.blocks[localIndex]
        })
        if ((await block) !== BLOCK_IDS.water) {
          continue
        }

        targetX = worldX
        targetZ = worldZ
        targetY = height + 1
        found = true
        break
      }
    }

    expect(found).toBe(true)

    const before = world.getInventorySnapshot(joined.clientPlayer.entityId)
    const placed = await world.applyBlockMutation(
      joined.clientPlayer.entityId,
      targetX,
      targetY,
      targetZ,
      BLOCK_IDS.grass,
    )

    expect(placed.changedChunks).toHaveLength(1)
    expect(placed.inventoryChanged).toBe(true)
    expect(placed.inventory.slots[0]).toEqual({
      itemId: before.slots[0]!.itemId,
      count: before.slots[0]!.count - 1,
    })

    const changedChunk = await world.getChunkPayload(
      worldToChunkCoord(targetX, targetY, targetZ).chunk,
    )
    const localIndex = getChunkLocalIndex(targetX, targetY, targetZ)
    expect(changedChunk.blocks[localIndex]).toBe(BLOCK_IDS.grass)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('crafting table block entities persist and emit server-side chat on use', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-crafting-table-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('CraftingTable', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)
    const given = await world.givePlayerItem(
      joined.clientPlayer.entityId,
      ITEM_IDS.craftingTable,
      1,
    )
    const craftingTableSlot = given.inventory.slots.findIndex(
      (slot) => slot.itemId === ITEM_IDS.craftingTable,
    )
    expect(craftingTableSlot).toBeGreaterThanOrEqual(0)
    await world.selectInventorySlot(joined.clientPlayer.entityId, craftingTableSlot)

    const targetX = 1
    const targetZ = 1
    const targetY = getTerrainHeight(worldRecord.seed, targetX, targetZ) + 1
    const placed = await world.applyBlockMutation(
      joined.clientPlayer.entityId,
      targetX,
      targetY,
      targetZ,
      BLOCK_IDS.craftingTable,
    )

    expect(placed.changedChunks).toHaveLength(1)
    expect(placed.inventoryChanged).toBe(true)

    const useResult = await world.runTick(
      [
        {
          sequence: 1,
          kind: 'useBlock',
          playerEntityId: joined.clientPlayer.entityId,
          x: targetX,
          y: targetY,
          z: targetZ,
        },
      ],
      0.05,
    )
    expect(useResult.chatMessages).toEqual([
      expect.objectContaining({
        targetPlayerEntityId: joined.clientPlayer.entityId,
        entry: expect.objectContaining({
          kind: 'system',
          text: 'CRAFTING TGABLE WAS CLICKED (TEMPORARY)',
        }),
      }),
    ])

    await world.save()

    const reloadedRecord = await storage.getWorld('CraftingTable')
    expect(reloadedRecord).not.toBeNull()
    const reloadedWorld = new AuthoritativeWorld(reloadedRecord!, storage, {
      createInventory: createTestStarterInventory,
    })
    const rejoined = await reloadedWorld.joinPlayer(PLAYER_A)
    const reloadedUse = await reloadedWorld.runTick(
      [
        {
          sequence: 1,
          kind: 'useBlock',
          playerEntityId: rejoined.clientPlayer.entityId,
          x: targetX,
          y: targetY,
          z: targetZ,
        },
      ],
      0.05,
    )

    expect(reloadedUse.chatMessages[0]?.entry.text).toBe('CRAFTING TGABLE WAS CLICKED (TEMPORARY)')
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('block mutations relight only the nearby loaded chunk neighborhood', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-local-relight-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('LocalRelight', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)
    const targetY = WORLD_SEA_LEVEL + 8
    const targetChunk = worldToChunkCoord(1, targetY, 1).chunk
    const chunkEntries = (
      world as unknown as {
        chunks: Map<
          string,
          {
            chunk: Chunk
            hasPersistedRecord: boolean
            hasLightData: boolean
            saveDirty: boolean
          }
        >
      }
    ).chunks
    for (let chunkZ = targetChunk.z - 1; chunkZ <= targetChunk.z + 1; chunkZ += 1) {
      for (let chunkX = targetChunk.x - 1; chunkX <= targetChunk.x + 1; chunkX += 1) {
        const coord = { x: chunkX, z: chunkZ }
        chunkEntries.set(`${coord.x},${coord.z}`, {
          chunk: new Chunk(coord),
          hasPersistedRecord: false,
          hasLightData: false,
          saveDirty: false,
        })
      }
    }
    chunkEntries.set(`${targetChunk.x + 4},${targetChunk.z + 4}`, {
      chunk: new Chunk({ x: targetChunk.x + 4, z: targetChunk.z + 4 }),
      hasPersistedRecord: false,
      hasLightData: false,
      saveDirty: false,
    })
    chunkEntries.get(`${targetChunk.x},${targetChunk.z}`)!.chunk.set(1, targetY, 1, BLOCK_IDS.grass)

    const lightingSystem = (
      world as unknown as {
        lightingSystem: {
          relightLoadedChunks: (
            chunks: readonly { coord: { x: number; z: number } }[],
            getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
          ) => { x: number; z: number }[]
        }
      }
    ).lightingSystem
    const originalRelightLoadedChunks = lightingSystem.relightLoadedChunks.bind(lightingSystem)
    const relitChunkCoords: Array<{ x: number; z: number }> = []

    lightingSystem.relightLoadedChunks = (chunks, getBlockAt) => {
      relitChunkCoords.splice(0, relitChunkCoords.length, ...chunks.map((chunk) => chunk.coord))
      return originalRelightLoadedChunks(chunks, getBlockAt)
    }

    await world.applyBlockMutation(joined.clientPlayer.entityId, 1, targetY, 1, BLOCK_IDS.air)

    expect(relitChunkCoords.length).toBeLessThanOrEqual(5)
    expect(relitChunkCoords).toEqual(expect.arrayContaining([targetChunk]))
    expect(relitChunkCoords).not.toEqual(
      expect.arrayContaining([{ x: targetChunk.x + 4, z: targetChunk.z + 4 }]),
    )
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('dropItem removes items from inventory and spawns a dropped item', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-drop-item-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('DropItem', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)
    // Test inventory: hotbar[0] = grass × 64

    const result = await world.dropItem(joined.clientPlayer.entityId, 0, 1)

    expect(result.inventory.slots[0]).toEqual({ itemId: ITEM_IDS.grass, count: 63 })
    expect(result.inventoryChanged).toBe(true)
    expect(result.droppedItems.spawned).toHaveLength(1)
    expect(result.droppedItems.spawned[0]?.itemId).toBe(ITEM_IDS.grass)
    expect(result.droppedItems.spawned[0]?.count).toBe(1)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('dropItem empties slot when count equals stack size', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-drop-stack-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('DropStack', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)

    const result = await world.dropItem(joined.clientPlayer.entityId, 0, 64)

    expect(result.inventory.slots[0]).toEqual({ itemId: ITEM_IDS.empty, count: 0 })
    expect(result.droppedItems.spawned).toHaveLength(1)
    expect(result.droppedItems.spawned[0]?.count).toBe(64)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('dropItem on an empty slot is a no-op', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'craftvale-authoritative-world-drop-empty-'))
  const storage = new BinaryWorldStorage(rootDir)

  try {
    const worldRecord = await storage.createWorld('DropEmpty', 42)
    const world = new AuthoritativeWorld(worldRecord, storage, {
      createInventory: createTestStarterInventory,
    })
    const joined = await world.joinPlayer(PLAYER_A)
    // Test inventory: hotbar[6] is empty

    const result = await world.dropItem(joined.clientPlayer.entityId, 6, 1)

    expect(result.inventoryChanged).toBe(false)
    expect(result.droppedItems.spawned).toHaveLength(0)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})
