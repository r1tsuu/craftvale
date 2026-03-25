import { PlayerController } from "../game/player.ts";
import {
  addVec3,
  crossVec3,
  lengthVec3,
  normalizeVec3,
  scaleVec3,
  vec3,
  type BlockId,
  type PlayerSnapshot,
  type Vec3,
} from "@craftvale/core/shared";
import {
  FIRST_PERSON_ARM_CAMERA_OFFSET,
  FIRST_PERSON_ARM_PART,
  FIRST_PERSON_HELD_ITEM_CAMERA_OFFSET,
  FIRST_PERSON_HELD_ITEM_SCALE,
  PLAYER_BODY_PARTS,
  getFirstPersonSwingAmount,
} from "./player-model.ts";

interface RenderableMesh {
  vao: number;
  indexCount: number;
}

const WORLD_UP = vec3(0, 1, 0);

const createForwardVector = (yaw: number, pitch: number): Vec3 =>
  normalizeVec3(
    vec3(
      Math.cos(pitch) * Math.cos(yaw),
      Math.sin(pitch),
      Math.cos(pitch) * Math.sin(yaw),
    ),
  );

const createOrientationBasis = (forward: Vec3): {
  right: Vec3;
  up: Vec3;
  back: Vec3;
} => {
  const back = scaleVec3(forward, -1);
  let right = crossVec3(WORLD_UP, back);
  if (lengthVec3(right) === 0) {
    right = vec3(1, 0, 0);
  } else {
    right = normalizeVec3(right);
  }

  const up = normalizeVec3(crossVec3(back, right));
  return {
    right,
    up,
    back,
  };
};

const createModelMatrix = (
  position: Vec3,
  scale: readonly [number, number, number],
  forward: Vec3,
): Float32Array => {
  const basis = createOrientationBasis(forward);
  return new Float32Array([
    basis.right.x * scale[0], basis.right.y * scale[0], basis.right.z * scale[0], 0,
    basis.up.x * scale[1], basis.up.y * scale[1], basis.up.z * scale[1], 0,
    basis.back.x * scale[2], basis.back.y * scale[2], basis.back.z * scale[2], 0,
    position.x, position.y, position.z, 1,
  ]);
};

const addScaled = (
  base: Vec3,
  direction: Vec3,
  magnitude: number,
): Vec3 => addVec3(base, scaleVec3(direction, magnitude));

export class PlayerRenderer {
  public constructor(
    private readonly setModelMatrix: (matrix: Float32Array) => void,
    private readonly getBlockMesh: (blockId: BlockId) => RenderableMesh | null,
    private readonly drawMesh: (mesh: RenderableMesh) => void,
  ) {}

  public renderWorldPlayers(players: readonly PlayerSnapshot[]): void {
    for (const player of players) {
      this.renderWorldPlayer(player);
    }
  }

  public renderFirstPersonViewModel(
    player: PlayerController,
    heldBlockId: BlockId | null,
    swingProgress = 0,
  ): void {
    const eye = player.getEyePositionVec3();
    const cameraForward = player.getForwardVector();
    const cameraBasis = createOrientationBasis(cameraForward);
    const swingAmount = getFirstPersonSwingAmount(swingProgress);

    const armPosition = addScaled(
      addScaled(
        addScaled(
          eye,
          cameraBasis.right,
          FIRST_PERSON_ARM_CAMERA_OFFSET.right - swingAmount * 0.18,
        ),
        cameraBasis.up,
        FIRST_PERSON_ARM_CAMERA_OFFSET.up - swingAmount * 0.14,
      ),
      cameraForward,
      FIRST_PERSON_ARM_CAMERA_OFFSET.forward - swingAmount * 0.1,
    );
    this.renderCuboid(
      FIRST_PERSON_ARM_PART.blockId,
      armPosition,
      FIRST_PERSON_ARM_PART.size,
      createForwardVector(
        player.state.yaw - 0.5 + swingAmount * 0.35,
        player.state.pitch + 0.7 - swingAmount * 0.5,
      ),
    );

    if (heldBlockId === null) {
      return;
    }

    const heldPosition = addScaled(
      addScaled(
        addScaled(
          eye,
          cameraBasis.right,
          FIRST_PERSON_HELD_ITEM_CAMERA_OFFSET.right - swingAmount * 0.14,
        ),
        cameraBasis.up,
        FIRST_PERSON_HELD_ITEM_CAMERA_OFFSET.up - swingAmount * 0.18,
      ),
      cameraForward,
      FIRST_PERSON_HELD_ITEM_CAMERA_OFFSET.forward - swingAmount * 0.12,
    );
    this.renderCuboid(
      heldBlockId,
      heldPosition,
      [
        FIRST_PERSON_HELD_ITEM_SCALE,
        FIRST_PERSON_HELD_ITEM_SCALE,
        FIRST_PERSON_HELD_ITEM_SCALE,
      ],
      createForwardVector(
        player.state.yaw - 0.35 + swingAmount * 0.28,
        player.state.pitch + 0.42 - swingAmount * 0.42,
      ),
    );
  }

  private renderWorldPlayer(player: PlayerSnapshot): void {
    const bodyForward = createForwardVector(player.state.yaw, 0);
    const bodyBasis = createOrientationBasis(bodyForward);
    const root = vec3(...player.state.position);

    for (const part of PLAYER_BODY_PARTS) {
      const partPosition = addScaled(
        addScaled(
          addScaled(root, bodyBasis.right, part.offset[0]),
          bodyBasis.up,
          part.offset[1],
        ),
        bodyForward,
        part.offset[2],
      );
      const forward = part.pitchFollowsLook
        ? createForwardVector(player.state.yaw, player.state.pitch * 0.35)
        : bodyForward;
      this.renderCuboid(part.blockId, partPosition, part.size, forward);
    }
  }

  private renderCuboid(
    blockId: BlockId,
    position: Vec3,
    scale: readonly [number, number, number],
    forward: Vec3,
  ): void {
    const mesh = this.getBlockMesh(blockId);
    if (!mesh) {
      return;
    }

    this.setModelMatrix(createModelMatrix(position, scale, forward));
    this.drawMesh(mesh);
  }
}
