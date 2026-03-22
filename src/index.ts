import type { Vec3 } from "./math/vec3.ts";
import { PlayerController } from "./game/player.ts";
import { NativeBridge } from "./platform/native.ts";
import { VoxelRenderer } from "./render/renderer.ts";
import type { TextDrawCommand } from "./render/text.ts";
import { evaluateUi, type UiResolvedComponent } from "./ui/components.ts";
import { buildMainMenu } from "./ui/menu.ts";
import { raycastVoxel } from "./world/raycast.ts";
import { ACTIVE_CHUNK_RADIUS, CHUNK_SIZE } from "./world/constants.ts";
import { VoxelWorld } from "./world/world.ts";

const FIXED_TIMESTEP = 1 / 60;
type AppMode = "menu" | "playing";
const MENU_SEED = (Date.now() ^ 0x5f3759df) >>> 0;

const nativeBridge = new NativeBridge();
nativeBridge.initWindow({
  width: 1440,
  height: 900,
  title: "Minecraft Clone",
});
nativeBridge.setCursorDisabled(false);

let world = new VoxelWorld();
const player = new PlayerController();
const renderer = new VoxelRenderer(nativeBridge);

let previousTime = nativeBridge.getTime();
let accumulator = 0;
let smoothedFps = 60;
let previousPrimaryDown = false;
let previousSecondaryDown = false;
let appMode: AppMode = "menu";

const updateGame = (input: ReturnType<NativeBridge["pollInput"]>, deltaSeconds: number): void => {
  if (input.exit) {
    nativeBridge.requestClose();
  }

  const playerChunkX = Math.floor(player.state.position[0] / CHUNK_SIZE);
  const playerChunkZ = Math.floor(player.state.position[2] / CHUNK_SIZE);
  world.ensureActiveArea(playerChunkX, playerChunkZ, ACTIVE_CHUNK_RADIUS);
  player.update(input, deltaSeconds, world);

  const hit = raycastVoxel(world, player.getEyePositionVec3(), player.getForwardVector(), 8);
  if (hit && input.breakBlock && !previousPrimaryDown) {
    world.setBlock(hit.hit.x, hit.hit.y, hit.hit.z, 0);
  }

  if (hit && input.placeBlock && !previousSecondaryDown) {
    world.setBlock(hit.place.x, hit.place.y, hit.place.z, 3);
  }
};

const renderFrame = (
  framebufferWidth: number,
  framebufferHeight: number,
  windowWidth: number,
  windowHeight: number,
  focusedBlock: Vec3 | null,
  overlayText: readonly TextDrawCommand[],
  uiComponents: readonly UiResolvedComponent[],
): void => {
  nativeBridge.beginFrame();
  renderer.render(
    world,
    player,
    framebufferWidth,
    framebufferHeight,
    focusedBlock,
    overlayText,
    uiComponents,
    windowWidth,
    windowHeight,
  );
  nativeBridge.endFrame();
};

try {
  while (!nativeBridge.shouldClose()) {
    const input = nativeBridge.pollInput();
    const primaryPressed = input.breakBlock && !previousPrimaryDown;
    const currentTime = nativeBridge.getTime();
    const deltaTime = Math.min(currentTime - previousTime, 0.25);
    previousTime = currentTime;
    accumulator += deltaTime;
    if (deltaTime > 0) {
      const instantaneousFps = 1 / deltaTime;
      smoothedFps = smoothedFps * 0.9 + instantaneousFps * 0.1;
    }

    let focusedBlock: Vec3 | null = null;
    let overlayText: TextDrawCommand[] = [];
    let uiComponents: UiResolvedComponent[] = [];

    if (appMode === "menu") {
      if (input.exit) {
        nativeBridge.requestClose();
      }

      const menu = buildMainMenu(input.windowWidth, input.windowHeight, MENU_SEED);
      const evaluation = evaluateUi(menu, {
        x: input.cursorX,
        y: input.cursorY,
        primaryDown: input.breakBlock,
        primaryPressed,
      });
      uiComponents = evaluation.components;

      for (const action of evaluation.actions) {
        if (action === "start-game") {
          world = new VoxelWorld();
          player.reset();
          world.ensureActiveArea(0, 0, ACTIVE_CHUNK_RADIUS);
          appMode = "playing";
          nativeBridge.setCursorDisabled(true);
          accumulator = 0;
        }

        if (action === "quit-game") {
          nativeBridge.requestClose();
        }
      }
    } else {
      player.applyLook(input);

      while (accumulator >= FIXED_TIMESTEP) {
        updateGame(input, FIXED_TIMESTEP);
        accumulator -= FIXED_TIMESTEP;
      }

      const focusHit = raycastVoxel(world, player.getEyePositionVec3(), player.getForwardVector(), 8);
      const [x, y, z] = player.state.position;
      const yawDegrees = (player.state.yaw * 180) / Math.PI;
      const pitchDegrees = (player.state.pitch * 180) / Math.PI;

      focusedBlock = focusHit?.hit ?? null;
      overlayText = [
        {
          text: `FPS: ${smoothedFps.toFixed(1)}`,
          x: 20,
          y: 20,
          scale: 3,
          color: [0.98, 0.98, 0.98],
          shadowColor: [0.05, 0.06, 0.08],
        },
        {
          text: `POS X:${x.toFixed(2)} Y:${y.toFixed(2)} Z:${z.toFixed(2)}`,
          x: 20,
          y: 53,
          scale: 3,
          color: [0.98, 0.98, 0.98],
          shadowColor: [0.05, 0.06, 0.08],
        },
        {
          text: `ROT YAW:${yawDegrees.toFixed(1)} PITCH:${pitchDegrees.toFixed(1)}`,
          x: 20,
          y: 86,
          scale: 3,
          color: [0.98, 0.98, 0.98],
          shadowColor: [0.05, 0.06, 0.08],
        },
      ];
    }

    renderFrame(
      input.framebufferWidth,
      input.framebufferHeight,
      input.windowWidth,
      input.windowHeight,
      focusedBlock,
      overlayText,
      uiComponents,
    );
    previousPrimaryDown = input.breakBlock;
    previousSecondaryDown = input.placeBlock;
    await Bun.sleep(0);
  }
} finally {
  nativeBridge.shutdown();
}
