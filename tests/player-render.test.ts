import { expect, test } from 'bun:test'

import type { PlayerSnapshot } from '../packages/core/src/types.ts'

import {
  collectVisibleRemotePlayers,
  getFirstPersonSwingAmount,
  getHeldItemBlockId,
} from '../apps/client/src/render/player-model.ts'
import { BLOCK_IDS } from '../packages/core/src/world/blocks.ts'
import {
  normalizeInventorySnapshot,
} from '../packages/core/src/world/inventory.ts'
import { ITEM_IDS } from '../packages/core/src/world/items.ts'

const createPlayerSnapshot = (
  entityId: string,
  name: string,
  position: [number, number, number],
  active = true,
): PlayerSnapshot => ({
  entityId,
  name,
  active,
  gamemode: 0,
  flying: false,
  state: {
    position,
    yaw: 0,
    pitch: 0,
  },
})

test('collectVisibleRemotePlayers excludes the local player and out-of-range players', () => {
  const local = createPlayerSnapshot('player:1', 'Developer', [0, 64, 0])
  const bob = createPlayerSnapshot('player:2', 'Bob', [12, 64, 12])
  const alice = createPlayerSnapshot('player:3', 'Alice', [8, 64, 0])
  const inactive = createPlayerSnapshot('player:4', 'Idle', [4, 64, 4], false)
  const distant = createPlayerSnapshot('player:5', 'Far', [80, 64, 0])

  expect(
    collectVisibleRemotePlayers(
      [local, bob, alice, inactive, distant],
      local.entityId,
      local.state.position,
      2,
    ).map((player) => player.name),
  ).toEqual(['Alice', 'Bob'])
})

test('collectVisibleRemotePlayers includes active players when no local entity id is known', () => {
  const alpha = createPlayerSnapshot('player:2', 'Alpha', [0, 64, 0])
  const bravo = createPlayerSnapshot('player:3', 'Bravo', [31, 64, 31])

  expect(
    collectVisibleRemotePlayers([bravo, alpha], null, [0, 64, 0], 2).map((player) => player.name),
  ).toEqual(['Alpha', 'Bravo'])
})

test('getHeldItemBlockId follows the selected hotbar slot and treats empty slots as no held item', () => {
  const inventory = normalizeInventorySnapshot({
    slots: [
      { itemId: ITEM_IDS.grass, count: 64 },
      { itemId: ITEM_IDS.empty, count: 0 },
      { itemId: ITEM_IDS.empty, count: 0 },
      { itemId: ITEM_IDS.empty, count: 0 },
      { itemId: ITEM_IDS.log, count: 64 },
    ],
    selectedSlot: 4,
    cursor: null,
  })
  expect(getHeldItemBlockId(inventory)).toBe(BLOCK_IDS.log)

  const emptySelected = {
    ...inventory,
    slots: inventory.slots.map((slot, index) =>
      index === 4 ? { itemId: ITEM_IDS.empty, count: 0 } : { ...slot },
    ),
  }
  expect(getHeldItemBlockId(emptySelected)).toBeNull()
})

test('first-person swing amount peaks mid-animation and clamps at the ends', () => {
  expect(getFirstPersonSwingAmount(-1)).toBe(0)
  expect(getFirstPersonSwingAmount(0)).toBe(0)
  expect(getFirstPersonSwingAmount(0.5)).toBeCloseTo(1, 5)
  expect(getFirstPersonSwingAmount(1)).toBeCloseTo(0, 5)
  expect(getFirstPersonSwingAmount(2)).toBeCloseTo(0, 5)
})
