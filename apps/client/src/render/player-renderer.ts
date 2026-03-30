import {
  addVec3,
  type BlockId,
  crossVec3,
  lengthVec3,
  type LivingEntitySnapshot,
  normalizeVec3,
  type PigSnapshot,
  type PlayerSnapshot,
  scaleVec3,
  vec3,
  type Vec3,
} from '@craftvale/core/shared'

import type { PlayerController } from '../game/player.ts'

import {
  type CuboidPartDefinition,
  FIRST_PERSON_ARM_CAMERA_OFFSET,
  FIRST_PERSON_ARM_PART,
  FIRST_PERSON_ARM_ROLL,
  FIRST_PERSON_HELD_ITEM_CAMERA_OFFSET,
  FIRST_PERSON_HELD_ITEM_SCALE,
  getFirstPersonSwingAmount,
  PIG_BODY_PARTS,
  PLAYER_BODY_PARTS,
} from './player-model.ts'

interface RenderableMesh {
  vao: number
  indexCount: number
}

const WORLD_UP = vec3(0, 1, 0)

const createForwardVector = (yaw: number, pitch: number): Vec3 =>
  normalizeVec3(
    vec3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)),
  )

const createOrientationBasis = (
  forward: Vec3,
): {
  right: Vec3
  up: Vec3
  back: Vec3
} => {
  const back = scaleVec3(forward, -1)
  let right = crossVec3(WORLD_UP, back)
  if (lengthVec3(right) === 0) {
    right = vec3(1, 0, 0)
  } else {
    right = normalizeVec3(right)
  }

  const up = normalizeVec3(crossVec3(back, right))
  return {
    right,
    up,
    back,
  }
}

const createModelMatrix = (
  position: Vec3,
  scale: readonly [number, number, number],
  forward: Vec3,
): Float32Array => {
  const basis = createOrientationBasis(forward)
  return new Float32Array([
    basis.right.x * scale[0],
    basis.right.y * scale[0],
    basis.right.z * scale[0],
    0,
    basis.up.x * scale[1],
    basis.up.y * scale[1],
    basis.up.z * scale[1],
    0,
    basis.back.x * scale[2],
    basis.back.y * scale[2],
    basis.back.z * scale[2],
    0,
    position.x,
    position.y,
    position.z,
    1,
  ])
}

const createModelMatrixWithRoll = (
  position: Vec3,
  scale: readonly [number, number, number],
  forward: Vec3,
  roll: number,
): Float32Array => {
  const basis = createOrientationBasis(forward)
  const cosR = Math.cos(roll)
  const sinR = Math.sin(roll)
  const right = {
    x: basis.right.x * cosR + basis.up.x * sinR,
    y: basis.right.y * cosR + basis.up.y * sinR,
    z: basis.right.z * cosR + basis.up.z * sinR,
  }
  const up = {
    x: -basis.right.x * sinR + basis.up.x * cosR,
    y: -basis.right.y * sinR + basis.up.y * cosR,
    z: -basis.right.z * sinR + basis.up.z * cosR,
  }
  return new Float32Array([
    right.x * scale[0],
    right.y * scale[0],
    right.z * scale[0],
    0,
    up.x * scale[1],
    up.y * scale[1],
    up.z * scale[1],
    0,
    basis.back.x * scale[2],
    basis.back.y * scale[2],
    basis.back.z * scale[2],
    0,
    position.x,
    position.y,
    position.z,
    1,
  ])
}

const addScaled = (base: Vec3, direction: Vec3, magnitude: number): Vec3 =>
  addVec3(base, scaleVec3(direction, magnitude))

export class PlayerRenderer {
  private bobPhase = 0
  private bobOffset = 0
  private prevPosition: readonly [number, number, number] | null = null

  public constructor(
    private readonly setModelMatrix: (matrix: Float32Array) => void,
    private readonly setLightingOverride: (skyLight: number, blockLight: number) => void,
    private readonly getBlockMesh: (blockId: BlockId) => RenderableMesh | null,
    private readonly drawMesh: (mesh: RenderableMesh) => void,
  ) {}

  public renderWorldPlayers(
    players: readonly PlayerSnapshot[],
    sampleLighting: (position: Vec3) => {
      skyLight: number
      blockLight: number
    },
  ): void {
    for (const player of players) {
      const lighting = sampleLighting(
        vec3(player.state.position[0], player.state.position[1] + 1, player.state.position[2]),
      )
      this.setLightingOverride(lighting.skyLight, lighting.blockLight)
      this.renderWorldPlayer(player)
    }

    this.setLightingOverride(-1, -1)
  }

  public renderWorldPigs(
    pigs: readonly PigSnapshot[],
    sampleLighting: (position: Vec3) => {
      skyLight: number
      blockLight: number
    },
  ): void {
    for (const pig of pigs) {
      const lighting = sampleLighting(
        vec3(pig.state.position[0], pig.state.position[1] + 0.75, pig.state.position[2]),
      )
      this.setLightingOverride(lighting.skyLight, lighting.blockLight)
      this.renderLivingEntity(pig, PIG_BODY_PARTS)
    }

    this.setLightingOverride(-1, -1)
  }

  public renderFirstPersonViewModel(
    player: PlayerController,
    heldBlockId: BlockId | null,
    swingProgress = 0,
  ): void {
    const BOB_FREQUENCY = 2.5
    const BOB_AMPLITUDE = 0.014
    const BOB_DECAY = 0.85
    const pos = player.state.position
    if (this.prevPosition !== null) {
      const dx = pos[0] - this.prevPosition[0]
      const dz = pos[2] - this.prevPosition[2]
      const horizDist = Math.sqrt(dx * dx + dz * dz)
      if (horizDist > 0.001) {
        this.bobPhase += horizDist * BOB_FREQUENCY
        this.bobOffset = Math.sin(this.bobPhase) * BOB_AMPLITUDE
      } else {
        this.bobOffset *= BOB_DECAY
        if (Math.abs(this.bobOffset) < 0.0001) this.bobOffset = 0
      }
    }
    this.prevPosition = pos

    const eye = player.getEyePositionVec3()
    const cameraForward = player.getForwardVector()
    const cameraBasis = createOrientationBasis(cameraForward)
    const swingAmount = getFirstPersonSwingAmount(swingProgress)

    const armForward = createForwardVector(
      player.state.yaw - 0.55 + swingAmount * 0.35,
      player.state.pitch + 0.05 - swingAmount * 0.5,
    )
    const armPosition = addScaled(
      addScaled(
        addScaled(
          eye,
          cameraBasis.right,
          FIRST_PERSON_ARM_CAMERA_OFFSET.right - swingAmount * 0.18,
        ),
        cameraBasis.up,
        FIRST_PERSON_ARM_CAMERA_OFFSET.up - swingAmount * 0.14 + this.bobOffset,
      ),
      cameraForward,
      FIRST_PERSON_ARM_CAMERA_OFFSET.forward - swingAmount * 0.1,
    )

    if (heldBlockId === null) {
      this.renderCuboidWithRoll(
        FIRST_PERSON_ARM_PART.blockId,
        armPosition,
        FIRST_PERSON_ARM_PART.size,
        armForward,
        FIRST_PERSON_ARM_ROLL,
      )
      return
    }

    const heldPosition = addScaled(
      addScaled(
        addScaled(
          eye,
          cameraBasis.right,
          FIRST_PERSON_HELD_ITEM_CAMERA_OFFSET.right - swingAmount * 0.14,
        ),
        cameraBasis.up,
        FIRST_PERSON_HELD_ITEM_CAMERA_OFFSET.up - swingAmount * 0.18 + this.bobOffset,
      ),
      cameraForward,
      FIRST_PERSON_HELD_ITEM_CAMERA_OFFSET.forward - swingAmount * 0.12,
    )
    this.renderCuboid(
      heldBlockId,
      heldPosition,
      [FIRST_PERSON_HELD_ITEM_SCALE, FIRST_PERSON_HELD_ITEM_SCALE, FIRST_PERSON_HELD_ITEM_SCALE],
      createForwardVector(
        player.state.yaw - 0.55 + swingAmount * 0.28,
        player.state.pitch + 0.32 - swingAmount * 0.42,
      ),
    )
  }

  public renderInventoryPreview(yaw: number, pitch: number): void {
    this.renderLivingEntity(
      {
        entityId: 'inventory-preview',
        active: true,
        state: {
          position: [0, 0, 0],
          yaw,
          pitch,
        },
      },
      PLAYER_BODY_PARTS,
    )
  }

  private renderWorldPlayer(player: PlayerSnapshot): void {
    this.renderLivingEntity(player, PLAYER_BODY_PARTS)
  }

  private renderLivingEntity(
    entity: LivingEntitySnapshot,
    parts: readonly CuboidPartDefinition[],
  ): void {
    const bodyForward = createForwardVector(entity.state.yaw, 0)
    const bodyBasis = createOrientationBasis(bodyForward)
    const root = vec3(...entity.state.position)

    for (const part of parts) {
      const partPosition = addScaled(
        addScaled(addScaled(root, bodyBasis.right, part.offset[0]), bodyBasis.up, part.offset[1]),
        bodyForward,
        part.offset[2],
      )
      const forward = part.pitchFollowsLook
        ? createForwardVector(entity.state.yaw, entity.state.pitch * 0.35)
        : bodyForward
      this.renderCuboid(part.blockId, partPosition, part.size, forward)
    }
  }

  private renderCuboid(
    blockId: BlockId,
    position: Vec3,
    scale: readonly [number, number, number],
    forward: Vec3,
  ): void {
    const mesh = this.getBlockMesh(blockId)
    if (!mesh) {
      return
    }

    this.setModelMatrix(createModelMatrix(position, scale, forward))
    this.drawMesh(mesh)
  }

  private renderCuboidWithRoll(
    blockId: BlockId,
    position: Vec3,
    scale: readonly [number, number, number],
    forward: Vec3,
    roll: number,
  ): void {
    const mesh = this.getBlockMesh(blockId)
    if (!mesh) {
      return
    }

    this.setModelMatrix(createModelMatrixWithRoll(position, scale, forward, roll))
    this.drawMesh(mesh)
  }
}
