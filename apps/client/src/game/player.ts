import {
  addVec3,
  crossVec3,
  createLookAtMat4,
  createPerspectiveMat4,
  lengthVec3,
  multiplyMat4,
  normalizeVec3,
  scaleVec3,
  vec3,
  type PlayerGamemode,
  type PlayerSnapshot,
  type Vec3,
  VoxelWorld,
  isSolidBlock,
} from "@craftvale/core/shared";
import type { ClientSettings, InputState } from "../types.ts";
import type { PlayerState } from "@craftvale/core/shared";

const WORLD_UP = vec3(0, 1, 0);
const MOVE_SPEED = 4.75;
const JUMP_VELOCITY = 7.5;
const GRAVITY = 24;
const BASE_MOUSE_SENSITIVITY = 0.0025;
const DEFAULT_FOV_DEGREES = 70;
const PLAYER_RADIUS = 0.32;
const PLAYER_HEIGHT = 1.8;
const PLAYER_EYE_HEIGHT = 1.62;
const COLLISION_STEP = 0.2;
const FLY_SPEED = 7;
const DOUBLE_TAP_WINDOW_SECONDS = 0.32;

export class PlayerController {
  private verticalVelocity = 0;
  private grounded = false;
  private previousJumpDown = false;
  private timeSinceJumpPress = Number.POSITIVE_INFINITY;
  private fovDegrees = DEFAULT_FOV_DEGREES;
  private mouseSensitivityPercent = 100;
  public gamemode: PlayerGamemode = 0;
  public flying = false;

  public state: PlayerState = {
    position: [0, 10, 0],
    yaw: -Math.PI / 2,
    pitch: -0.25,
  };

  public reset(position: [number, number, number] = [0, 10, 0]): void {
    this.setState(
      {
        position,
        yaw: -Math.PI / 2,
        pitch: -0.25,
      },
      true,
    );
    this.setMovementState(0, false, true);
  }

  public resetFromSnapshot(snapshot: PlayerSnapshot): void {
    this.setState(snapshot.state, true);
    this.setMovementState(snapshot.gamemode, snapshot.flying, true);
  }

  public syncFromSnapshot(snapshot: PlayerSnapshot): void {
    this.setState(snapshot.state, false);
    this.setMovementState(snapshot.gamemode, snapshot.flying, false);
  }

  private setState(state: PlayerState, resetMotion: boolean): void {
    this.state = {
      position: [...state.position],
      yaw: state.yaw,
      pitch: state.pitch,
    };

    if (resetMotion) {
      this.verticalVelocity = 0;
      this.grounded = false;
    }
  }

  public applyClientSettings(settings: Pick<ClientSettings, "fovDegrees" | "mouseSensitivity">): void {
    this.fovDegrees = settings.fovDegrees;
    this.mouseSensitivityPercent = settings.mouseSensitivity;
  }

  public applyLook(input: InputState): void {
    const mouseSensitivity = BASE_MOUSE_SENSITIVITY * (this.mouseSensitivityPercent / 100);
    this.state.yaw += input.mouseDeltaX * mouseSensitivity;
    this.state.pitch -= input.mouseDeltaY * mouseSensitivity;
    this.state.pitch = Math.max(-1.54, Math.min(1.54, this.state.pitch));
  }

  public update(input: InputState, deltaSeconds: number, world: VoxelWorld): void {
    this.timeSinceJumpPress += deltaSeconds;
    const jumpPressed = input.moveUp && !this.previousJumpDown;
    if (this.gamemode === 1 && jumpPressed) {
      if (this.timeSinceJumpPress <= DOUBLE_TAP_WINDOW_SECONDS) {
        this.flying = !this.flying;
        this.verticalVelocity = 0;
      }
      this.timeSinceJumpPress = 0;
    } else if (this.gamemode === 0) {
      this.flying = false;
      this.timeSinceJumpPress = Number.POSITIVE_INFINITY;
    }

    if (this.flying) {
      this.updateFlying(input, deltaSeconds, world);
      this.previousJumpDown = input.moveUp;
      return;
    }

    const forward = this.getWalkForwardVector();
    const right = normalizeVec3(crossVec3(forward, WORLD_UP));
    let movement = vec3();

    if (input.moveForward) movement = addVec3(movement, forward);
    if (input.moveBackward) movement = addVec3(movement, scaleVec3(forward, -1));
    if (input.moveRight) movement = addVec3(movement, right);
    if (input.moveLeft) movement = addVec3(movement, scaleVec3(right, -1));

    const normalized = lengthVec3(movement) > 0 ? normalizeVec3(movement) : movement;
    let position = this.getPositionVec3();
    this.grounded = this.isStandingOnGround(world, position);

    if (input.moveUp && this.grounded) {
      this.verticalVelocity = JUMP_VELOCITY;
      this.grounded = false;
    }

    this.verticalVelocity -= GRAVITY * deltaSeconds;

    position = this.moveAxis(world, position, "x", normalized.x * MOVE_SPEED * deltaSeconds);
    position = this.moveAxis(world, position, "z", normalized.z * MOVE_SPEED * deltaSeconds);

    const beforeVertical = position.y;
    position = this.moveAxis(world, position, "y", this.verticalVelocity * deltaSeconds);

    if (position.y === beforeVertical && this.verticalVelocity !== 0) {
      if (this.verticalVelocity < 0) {
        position = vec3(position.x, Math.floor(position.y + 0.0001), position.z);
        this.grounded = true;
      }
      this.verticalVelocity = 0;
    }

    this.state.position = [position.x, position.y, position.z];
    this.previousJumpDown = input.moveUp;
  }

  public getPositionVec3(): Vec3 {
    return vec3(...this.state.position);
  }

  public getEyePositionVec3(): Vec3 {
    return addVec3(this.getPositionVec3(), vec3(0, PLAYER_EYE_HEIGHT, 0));
  }

  public getForwardVector(): Vec3 {
    const { yaw, pitch } = this.state;
    return normalizeVec3(
      vec3(
        Math.cos(pitch) * Math.cos(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.sin(yaw),
      ),
    );
  }

  public getViewProjection(aspect: number): Float32Array {
    const eye = this.getEyePositionVec3();
    const target = addVec3(eye, this.getForwardVector());
    const view = createLookAtMat4(eye, target, WORLD_UP);
    const projection = createPerspectiveMat4((this.fovDegrees * Math.PI) / 180, aspect, 0.1, 500);
    return multiplyMat4(projection, view);
  }

  private getWalkForwardVector(): Vec3 {
    return normalizeVec3(
      vec3(
        Math.cos(this.state.yaw),
        0,
        Math.sin(this.state.yaw),
      ),
    );
  }

  private updateFlying(input: InputState, deltaSeconds: number, world: VoxelWorld): void {
    const forward = this.getWalkForwardVector();
    const right = normalizeVec3(crossVec3(forward, WORLD_UP));
    let movement = vec3();

    if (input.moveForward) movement = addVec3(movement, forward);
    if (input.moveBackward) movement = addVec3(movement, scaleVec3(forward, -1));
    if (input.moveRight) movement = addVec3(movement, right);
    if (input.moveLeft) movement = addVec3(movement, scaleVec3(right, -1));
    if (input.moveUp) movement = addVec3(movement, WORLD_UP);
    if (input.moveDown) movement = addVec3(movement, scaleVec3(WORLD_UP, -1));

    const normalized = lengthVec3(movement) > 0 ? normalizeVec3(movement) : movement;
    let position = this.getPositionVec3();
    position = this.moveAxis(world, position, "x", normalized.x * FLY_SPEED * deltaSeconds);
    position = this.moveAxis(world, position, "z", normalized.z * FLY_SPEED * deltaSeconds);
    position = this.moveAxis(world, position, "y", normalized.y * FLY_SPEED * deltaSeconds);
    this.state.position = [position.x, position.y, position.z];
    this.verticalVelocity = 0;
    this.grounded = false;
  }

  private moveAxis(
    world: VoxelWorld,
    position: Vec3,
    axis: "x" | "y" | "z",
    delta: number,
  ): Vec3 {
    if (delta === 0) {
      return position;
    }

    let next = position;
    let remaining = delta;

    while (Math.abs(remaining) > 0) {
      const step = Math.max(-COLLISION_STEP, Math.min(COLLISION_STEP, remaining));
      const candidate = vec3(next.x, next.y, next.z);
      candidate[axis] += step;

      if (this.collidesAt(world, candidate)) {
        return next;
      }

      next = candidate;
      remaining -= step;
    }

    return next;
  }

  private isStandingOnGround(world: VoxelWorld, position: Vec3): boolean {
    return this.collidesAt(world, vec3(position.x, position.y - 0.05, position.z));
  }

  private collidesAt(world: VoxelWorld, position: Vec3): boolean {
    const minX = Math.floor(position.x - PLAYER_RADIUS);
    const maxX = Math.floor(position.x + PLAYER_RADIUS);
    const minY = Math.floor(position.y);
    const maxY = Math.floor(position.y + PLAYER_HEIGHT - 0.001);
    const minZ = Math.floor(position.z - PLAYER_RADIUS);
    const maxZ = Math.floor(position.z + PLAYER_RADIUS);

    for (let blockY = minY; blockY <= maxY; blockY += 1) {
      for (let blockZ = minZ; blockZ <= maxZ; blockZ += 1) {
        for (let blockX = minX; blockX <= maxX; blockX += 1) {
          if (isSolidBlock(world.getBlock(blockX, blockY, blockZ))) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private setMovementState(
    gamemode: PlayerGamemode,
    flying: boolean,
    resetTimers: boolean,
  ): void {
    const wasFlying = this.flying;
    this.gamemode = gamemode;
    this.flying = gamemode === 1 ? flying : false;
    if (wasFlying && !this.flying) {
      this.verticalVelocity = 0;
    }
    if (resetTimers) {
      this.previousJumpDown = false;
      this.timeSinceJumpPress = Number.POSITIVE_INFINITY;
    }
  }
}
