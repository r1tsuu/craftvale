import { expect, test } from 'bun:test'

import type { InputState } from '../apps/client/src/types.ts'
import type { PlayerSnapshot } from '../packages/core/src/types.ts'

import { createDefaultClientSettings } from '../apps/client/src/client/client-settings.ts'
import { PlayerController } from '../apps/client/src/game/player.ts'
import { VoxelWorld } from '../packages/core/src/world/world.ts'

const createInput = (overrides: Partial<InputState> = {}): InputState => ({
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  moveUp: false,
  moveDown: false,
  breakBlock: false,
  breakBlockPressed: false,
  placeBlock: false,
  placeBlockPressed: false,
  exitPressed: false,
  mouseDeltaX: 0,
  mouseDeltaY: 0,
  cursorX: 0,
  cursorY: 0,
  typedText: '',
  slashPressed: false,
  backspacePressed: false,
  enterPressed: false,
  tabPressed: false,
  inventoryToggle: false,
  hotbarSelection: null,
  windowWidth: 800,
  windowHeight: 600,
  framebufferWidth: 800,
  framebufferHeight: 600,
  resized: false,
  ...overrides,
})

const createEmptyWorld = (): VoxelWorld => {
  const world = new VoxelWorld()
  const chunk = world.ensureChunk({ x: 0, z: 0 })
  chunk.blocks.fill(0)
  chunk.dirty = true
  return world
}

const addFloor = (world: VoxelWorld): void => {
  for (let z = 0; z < 8; z += 1) {
    for (let x = 0; x < 8; x += 1) {
      world.setBlock(x, 0, z, 3)
    }
  }
}

const createSnapshot = (
  player: PlayerController,
  overrides: Partial<Pick<PlayerSnapshot, 'gamemode' | 'flying'>> = {},
): PlayerSnapshot => ({
  entityId: 'player:1',
  name: 'Alice',
  active: true,
  gamemode: overrides.gamemode ?? player.gamemode,
  flying: overrides.flying ?? player.flying,
  state: {
    position: [...player.state.position],
    yaw: player.state.yaw,
    pitch: player.state.pitch,
  },
})

test('gravity pulls the player onto the ground', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.state.position = [2.5, 4, 2.5]

  for (let step = 0; step < 120; step += 1) {
    player.update(createInput(), 1 / 60, world)
  }

  expect(player.state.position[1]).toBeCloseTo(1, 3)
})

test('jump raises the player before gravity brings them down', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.state.position = [2.5, 1, 2.5]

  player.update(createInput({ moveUp: true }), 1 / 60, world)
  const jumpedHeight = player.state.position[1]

  for (let step = 0; step < 120; step += 1) {
    player.update(createInput(), 1 / 60, world)
  }

  expect(jumpedHeight).toBeGreaterThan(1)
  expect(player.state.position[1]).toBeCloseTo(1, 3)
})

test('shallow embedded positions are resolved before jump physics runs', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.state.position = [2.5, 0.85, 2.5]

  player.update(createInput({ moveUp: true }), 1 / 60, world)

  expect(player.state.position[1]).toBeGreaterThan(1)
})

test('authoritative sync preserves upward momentum after a jump', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.state.position = [2.5, 1, 2.5]

  player.update(createInput({ moveUp: true }), 1 / 60, world)
  const heightAfterJump = player.state.position[1]
  player.syncFromSnapshot(createSnapshot(player))

  player.update(createInput(), 1 / 60, world)
  const heightAfterSync = player.state.position[1]

  expect(heightAfterSync).toBeGreaterThan(heightAfterJump)
})

test('reconcileFromSnapshot ignores stale local echoes during a jump arc', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.state.position = [2.5, 1, 2.5]

  let echoedSnapshot = createSnapshot(player)
  let maxHeight = player.state.position[1]
  for (let step = 0; step < 60; step += 1) {
    const jumpDown = step === 0
    player.update(createInput({ moveUp: jumpDown }), 1 / 60, world)
    player.reconcileFromSnapshot(echoedSnapshot)
    echoedSnapshot = createSnapshot(player)
    maxHeight = Math.max(maxHeight, player.state.position[1])
  }

  expect(maxHeight).toBeGreaterThan(2)
})

test('reconcileFromSnapshot still applies large authoritative corrections', () => {
  const player = new PlayerController()
  player.state.position = [8, 8, 8]

  player.reconcileFromSnapshot({
    entityId: 'player:1',
    name: 'Alice',
    active: true,
    gamemode: 0,
    flying: false,
    state: {
      position: [2.5, 1, 2.5],
      yaw: -Math.PI / 2,
      pitch: -0.25,
    },
  })

  expect(player.state.position).toEqual([2.5, 1, 2.5])
})

test('horizontal movement collides with solid blocks', () => {
  const world = createEmptyWorld()
  addFloor(world)
  for (let y = 1; y <= 2; y += 1) {
    for (let z = 1; z <= 3; z += 1) {
      world.setBlock(3, y, z, 3)
    }
  }

  const player = new PlayerController()
  player.state.position = [1.5, 1, 2.5]

  for (let step = 0; step < 60; step += 1) {
    player.update(createInput({ moveRight: true }), 1 / 60, world)
  }

  expect(player.state.position[0]).toBeLessThan(2.7)
})

test('creative mode toggles flight on double-space and allows vertical movement', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.resetFromSnapshot({
    entityId: 'player:1',
    name: 'Alice',
    active: true,
    gamemode: 1,
    flying: false,
    state: {
      position: [2.5, 1, 2.5],
      yaw: -Math.PI / 2,
      pitch: -0.25,
    },
  })

  player.update(createInput({ moveUp: true }), 1 / 60, world)
  player.update(createInput({ moveUp: false }), 0.1, world)
  player.update(createInput({ moveUp: true }), 1 / 60, world)
  expect(player.flying).toBe(true)

  const heightBeforeFlight = player.state.position[1]
  player.update(createInput({ moveUp: true }), 1 / 10, world)
  expect(player.state.position[1]).toBeGreaterThan(heightBeforeFlight)

  const heightBeforeDescend = player.state.position[1]
  player.update(createInput({ moveDown: true }), 1 / 10, world)
  expect(player.state.position[1]).toBeLessThan(heightBeforeDescend)
})

test('normal mode sync disables creative flight immediately', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.resetFromSnapshot({
    entityId: 'player:1',
    name: 'Alice',
    active: true,
    gamemode: 1,
    flying: true,
    state: {
      position: [2.5, 3, 2.5],
      yaw: -Math.PI / 2,
      pitch: -0.25,
    },
  })

  player.syncFromSnapshot({
    entityId: 'player:1',
    name: 'Alice',
    active: true,
    gamemode: 0,
    flying: false,
    state: {
      position: [2.5, 3, 2.5],
      yaw: -Math.PI / 2,
      pitch: -0.25,
    },
  })
  player.update(createInput(), 1 / 60, world)

  expect(player.flying).toBe(false)
  expect(player.gamemode).toBe(0)
  expect(player.state.position[1]).toBeLessThan(3)
})

test('disabling flight preserves normal gravity acceleration across syncs', () => {
  const world = createEmptyWorld()
  addFloor(world)
  const player = new PlayerController()
  player.resetFromSnapshot({
    entityId: 'player:1',
    name: 'Alice',
    active: true,
    gamemode: 1,
    flying: true,
    state: {
      position: [2.5, 6, 2.5],
      yaw: -Math.PI / 2,
      pitch: -0.25,
    },
  })

  player.syncFromSnapshot(createSnapshot(player, { flying: false }))
  const startingHeight = player.state.position[1]

  player.update(createInput(), 1 / 60, world)
  const afterFirstFall = player.state.position[1]
  player.syncFromSnapshot(createSnapshot(player))

  player.update(createInput(), 1 / 60, world)
  const afterSecondFall = player.state.position[1]

  expect(startingHeight - afterFirstFall).toBeLessThan(afterFirstFall - afterSecondFall)
})

test('mouse sensitivity settings scale look speed', () => {
  const player = new PlayerController()
  player.applyClientSettings({
    ...createDefaultClientSettings(),
    mouseSensitivity: 200,
  })

  player.applyLook(createInput({ mouseDeltaX: 10 }))

  expect(player.state.yaw).toBeCloseTo(-Math.PI / 2 + 0.05, 6)
})

test('fov settings change the projection matrix', () => {
  const player = new PlayerController()
  const defaultProjection = player.getViewProjection(16 / 9)

  player.applyClientSettings({
    ...createDefaultClientSettings(),
    fovDegrees: 100,
  })
  const widerProjection = player.getViewProjection(16 / 9)

  expect(widerProjection[0]).toBeLessThan(defaultProjection[0])
  expect(widerProjection[5]).toBeLessThan(defaultProjection[5])
})
