import type { BlockId, EntityId, PigSnapshot } from '../types.ts'

import { BLOCK_IDS, isSolidBlock } from '../world/blocks.ts'
import { CHUNK_SIZE, STARTUP_CHUNK_RADIUS, WORLD_MAX_BLOCK_Y } from '../world/constants.ts'
import { getTerrainHeight } from '../world/terrain.ts'
import { type WorldEntityState } from './world-entity-state.ts'

const TARGET_PIG_COUNT = 3
const PIG_SPAWN_ATTEMPTS = 96
const PIG_SPAWN_MIN_DISTANCE = 5
const PIG_WALK_SPEED = 0.9

const nextPrngState = (state: number): number => (Math.imul(state, 1664525) + 1013904223) >>> 0

const nextRandom = (state: number): { state: number; value: number } => {
  const nextState = nextPrngState(state)
  return {
    state: nextState,
    value: nextState / 0xffffffff,
  }
}

const distanceSquared2d = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx
  const dz = az - bz
  return dx * dx + dz * dz
}

export class PigSystem {
  private initialized = false

  public constructor(
    private readonly worldSeed: number,
    private readonly centerPosition: readonly [number, number, number],
    private readonly entities: WorldEntityState,
    private readonly getBlockAt: (worldX: number, worldY: number, worldZ: number) => BlockId,
  ) {}

  public initialize(): void {
    if (this.initialized) {
      return
    }

    this.initialized = true
    if ([...this.entities.livingType.entries()].some(([, living]) => living.type === 'pig')) {
      return
    }

    let prngState = (this.worldSeed ^ 0x9e3779b9) >>> 0
    const occupiedPositions: Array<readonly [number, number, number]> = []
    const spawnRadiusBlocks = (STARTUP_CHUNK_RADIUS + 1) * CHUNK_SIZE

    for (let attempt = 0; attempt < PIG_SPAWN_ATTEMPTS; attempt += 1) {
      if (occupiedPositions.length >= TARGET_PIG_COUNT) {
        break
      }

      const offsetX = nextRandom(prngState)
      prngState = offsetX.state
      const offsetZ = nextRandom(prngState)
      prngState = offsetZ.state

      const worldX =
        Math.floor(this.centerPosition[0]) + Math.round((offsetX.value * 2 - 1) * spawnRadiusBlocks)
      const worldZ =
        Math.floor(this.centerPosition[2]) + Math.round((offsetZ.value * 2 - 1) * spawnRadiusBlocks)
      const surface = this.findSpawnSurface(worldX, worldZ)
      if (!surface) {
        continue
      }

      const isTooCloseToExisting = occupiedPositions.some(
        (position) =>
          distanceSquared2d(position[0], position[2], surface.position[0], surface.position[2]) <
          PIG_SPAWN_MIN_DISTANCE * PIG_SPAWN_MIN_DISTANCE,
      )
      if (isTooCloseToExisting) {
        continue
      }

      const yawRandom = nextRandom(prngState)
      prngState = yawRandom.state
      const durationRandom = nextRandom(prngState)
      prngState = durationRandom.state

      const entityId = this.entities.registry.createEntity('pig')
      this.entities.livingType.set(entityId, { type: 'pig' })
      this.entities.livingActivity.set(entityId, { active: true })
      this.entities.livingTransform.set(entityId, {
        state: {
          position: [...surface.position],
          yaw: yawRandom.value * Math.PI * 2,
          pitch: 0,
        },
      })
      this.entities.pigWander.set(entityId, {
        mode: 'idle',
        remainingSeconds: 0.8 + durationRandom.value * 1.8,
        targetYaw: yawRandom.value * Math.PI * 2,
        prngState,
      })
      occupiedPositions.push(surface.position)
    }
  }

  public getPigSnapshots(): PigSnapshot[] {
    const pigs: PigSnapshot[] = []

    for (const [entityId, living] of this.entities.livingType.entries()) {
      if (living.type !== 'pig') {
        continue
      }

      pigs.push(this.getPigSnapshot(entityId))
    }

    pigs.sort((left, right) => left.entityId.localeCompare(right.entityId))
    return pigs
  }

  public tick(deltaSeconds: number): PigSnapshot[] {
    const updated: PigSnapshot[] = []
    const stepSeconds = Math.max(0, Math.min(deltaSeconds, 0.25))

    for (const [entityId, living] of this.entities.livingType.entries()) {
      if (living.type !== 'pig') {
        continue
      }

      const transform = this.entities.livingTransform.require(entityId, 'living transform')
      const wander = this.entities.pigWander.require(entityId, 'pig wander')
      let nextState = {
        position: [...transform.state.position] as [number, number, number],
        yaw: transform.state.yaw,
        pitch: transform.state.pitch,
      }
      let nextWander = { ...wander }
      let changed = false

      if (nextWander.mode === 'walk') {
        const distance = PIG_WALK_SPEED * stepSeconds
        const candidateX = nextState.position[0] + Math.cos(nextWander.targetYaw) * distance
        const candidateZ = nextState.position[2] + Math.sin(nextWander.targetYaw) * distance
        const candidatePosition = this.findWalkablePosition(
          candidateX,
          candidateZ,
          nextState.position[1],
        )

        if (candidatePosition) {
          nextState = {
            position: [...candidatePosition],
            yaw: nextWander.targetYaw,
            pitch: 0,
          }
          changed = true
        } else {
          nextWander = this.createIdleState(nextWander.prngState, nextState.yaw)
          changed = true
        }
      }

      nextWander.remainingSeconds -= stepSeconds
      if (nextWander.remainingSeconds <= 0) {
        nextWander =
          nextWander.mode === 'idle'
            ? this.createWalkState(nextWander.prngState, nextState.yaw)
            : this.createIdleState(nextWander.prngState, nextState.yaw)
        changed = true
      }

      if (
        nextState.position[0] !== transform.state.position[0] ||
        nextState.position[1] !== transform.state.position[1] ||
        nextState.position[2] !== transform.state.position[2] ||
        nextState.yaw !== transform.state.yaw ||
        nextState.pitch !== transform.state.pitch
      ) {
        this.entities.livingTransform.set(entityId, { state: nextState })
      }
      this.entities.pigWander.set(entityId, nextWander)

      if (changed) {
        updated.push(this.getPigSnapshot(entityId))
      }
    }

    return updated
  }

  private getPigSnapshot(entityId: EntityId): PigSnapshot {
    const transform = this.entities.livingTransform.require(entityId, 'living transform')
    const activity = this.entities.livingActivity.require(entityId, 'living activity')
    return {
      entityId,
      active: activity.active,
      state: {
        position: [...transform.state.position],
        yaw: transform.state.yaw,
        pitch: transform.state.pitch,
      },
    }
  }

  private createIdleState(prngState: number, currentYaw: number) {
    const duration = nextRandom(prngState)
    return {
      mode: 'idle' as const,
      remainingSeconds: 1 + duration.value * 2.25,
      targetYaw: currentYaw,
      prngState: duration.state,
    }
  }

  private createWalkState(prngState: number, currentYaw: number) {
    const yawRandom = nextRandom(prngState)
    const durationRandom = nextRandom(yawRandom.state)
    return {
      mode: 'walk' as const,
      remainingSeconds: 1.4 + durationRandom.value * 2.6,
      targetYaw: currentYaw + (yawRandom.value * 2 - 1) * (Math.PI * 0.9),
      prngState: durationRandom.state,
    }
  }

  private findSpawnSurface(
    worldX: number,
    worldZ: number,
  ): { position: [number, number, number] } | null {
    const topY = this.findSurfaceY(
      worldX,
      worldZ,
      getTerrainHeight(this.worldSeed, worldX, worldZ) + 5,
    )
    if (topY === null || this.getBlockAt(worldX, topY, worldZ) !== BLOCK_IDS.grass) {
      return null
    }

    return {
      position: [worldX + 0.5, topY + 1, worldZ + 0.5],
    }
  }

  private findWalkablePosition(
    worldX: number,
    worldZ: number,
    currentY: number,
  ): [number, number, number] | null {
    const blockX = Math.floor(worldX)
    const blockZ = Math.floor(worldZ)
    const topY = this.findSurfaceY(blockX, blockZ, Math.floor(currentY) + 2)
    if (topY === null) {
      return null
    }

    const standingY = topY + 1
    if (Math.abs(standingY - currentY) > 1.25) {
      return null
    }

    return [worldX, standingY, worldZ]
  }

  private findSurfaceY(worldX: number, worldZ: number, startY: number): number | null {
    const upperBound = Math.min(WORLD_MAX_BLOCK_Y - 2, startY)
    const lowerBound = Math.max(0, upperBound - 10)

    for (let worldY = upperBound; worldY >= lowerBound; worldY -= 1) {
      const blockId = this.getBlockAt(worldX, worldY, worldZ)
      if (!isSolidBlock(blockId)) {
        continue
      }

      if (
        isSolidBlock(this.getBlockAt(worldX, worldY + 1, worldZ)) ||
        isSolidBlock(this.getBlockAt(worldX, worldY + 2, worldZ))
      ) {
        continue
      }

      return worldY
    }

    return null
  }
}
