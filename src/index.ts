import type { Vec3 } from "./math/vec3.ts";
import {
  applyMenuAction,
  applyMenuTyping,
  createMenuState,
  parseSeedInput,
  setMenuBusy,
  setMenuStatus,
  setMenuWorlds,
  type MenuState,
} from "./client/menu-state.ts";
import { WorkerClientAdapter } from "./client/worker-client-adapter.ts";
import { ClientWorldRuntime } from "./client/world-runtime.ts";
import { PlayerController } from "./game/player.ts";
import { NativeBridge } from "./platform/native.ts";
import { VoxelRenderer } from "./render/renderer.ts";
import type { TextDrawCommand } from "./render/text.ts";
import { evaluateUi, type UiResolvedComponent } from "./ui/components.ts";
import { buildMainMenu } from "./ui/menu.ts";
import { ACTIVE_CHUNK_RADIUS } from "./world/constants.ts";
import { raycastVoxel } from "./world/raycast.ts";

const FIXED_TIMESTEP = 1 / 60;
type AppMode = "menu" | "playing";
const MENU_SEED = (Date.now() ^ 0x5f3759df) >>> 0;

const nativeBridge = new NativeBridge();
const clientAdapter = new WorkerClientAdapter();
const clientWorldRuntime = new ClientWorldRuntime(clientAdapter);
nativeBridge.initWindow({
  width: 1440,
  height: 900,
  title: "Minecraft Clone",
});
nativeBridge.setCursorDisabled(false);

const player = new PlayerController();
const renderer = new VoxelRenderer(nativeBridge);

let previousTime = nativeBridge.getTime();
let accumulator = 0;
let smoothedFps = 60;
let previousPrimaryDown = false;
let previousSecondaryDown = false;
let appMode: AppMode = "menu";
let menuState: MenuState = createMenuState();
let currentWorldName: string | null = null;
let lastServerMessage = "";

const syncMenuWorlds = async (statusText = "SELECT OR CREATE A WORLD"): Promise<void> => {
  menuState = setMenuBusy(menuState, true, "LOADING WORLDS...");

  try {
    const response = await clientAdapter.eventBus.send({
      type: "listWorlds",
      payload: {},
    });
    menuState = setMenuWorlds(
      {
        ...menuState,
        busy: false,
        statusText,
      },
      response.worlds,
    );
  } catch (error) {
    menuState = setMenuBusy(
      setMenuStatus(
        menuState,
        `FAILED TO LOAD WORLDS: ${error instanceof Error ? error.message : String(error)}`,
      ),
      false,
    );
  }
};

const joinWorld = async (worldName: string): Promise<void> => {
  menuState = setMenuBusy(menuState, true, `JOINING ${worldName}...`);

  try {
    const joined = await clientAdapter.eventBus.send({
      type: "joinWorld",
      payload: { name: worldName },
    });

    clientWorldRuntime.reset();
    currentWorldName = joined.world.name;
    player.reset(joined.spawnPosition);

    const initialCoords = clientWorldRuntime.getChunkCoordsAroundPosition(
      joined.spawnPosition,
      ACTIVE_CHUNK_RADIUS,
    );
    await clientWorldRuntime.requestMissingChunks(initialCoords);
    await clientWorldRuntime.waitForChunks(initialCoords);

    appMode = "playing";
    nativeBridge.setCursorDisabled(true);
    accumulator = 0;
    lastServerMessage = "";
    menuState = setMenuBusy(
      setMenuStatus(menuState, `JOINED ${joined.world.name}`),
      false,
    );
  } catch (error) {
    menuState = setMenuBusy(
      setMenuStatus(
        menuState,
        `FAILED TO JOIN: ${error instanceof Error ? error.message : String(error)}`,
      ),
      false,
    );
  }
};

const createWorld = async (): Promise<void> => {
  const worldName = menuState.createWorldName.trim();
  if (!worldName) {
    menuState = setMenuStatus(menuState, "WORLD NAME REQUIRED");
    return;
  }

  menuState = setMenuBusy(menuState, true, "CREATING WORLD...");

  try {
    const seed = parseSeedInput(menuState.createSeedText);
    const response = await clientAdapter.eventBus.send({
      type: "createWorld",
      payload: {
        name: worldName,
        seed,
      },
    });

    const worlds = [...menuState.worlds, response.world].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    menuState = setMenuWorlds(
      {
        ...menuState,
        busy: false,
        selectedWorldName: response.world.name,
        createWorldName: "",
        createSeedText: "",
        statusText: `CREATED ${response.world.name}`,
      },
      worlds,
    );
  } catch (error) {
    menuState = setMenuBusy(
      setMenuStatus(
        menuState,
        `FAILED TO CREATE: ${error instanceof Error ? error.message : String(error)}`,
      ),
      false,
    );
  }
};

const deleteWorld = async (): Promise<void> => {
  if (!menuState.selectedWorldName) {
    menuState = setMenuStatus(menuState, "SELECT A WORLD TO DELETE");
    return;
  }

  const worldName = menuState.selectedWorldName;
  menuState = setMenuBusy(menuState, true, `DELETING ${worldName}...`);

  try {
    await clientAdapter.eventBus.send({
      type: "deleteWorld",
      payload: { name: worldName },
    });
    await syncMenuWorlds(`DELETED ${worldName}`);
  } catch (error) {
    menuState = setMenuBusy(
      setMenuStatus(
        menuState,
        `FAILED TO DELETE: ${error instanceof Error ? error.message : String(error)}`,
      ),
      false,
    );
  }
};

const saveCurrentWorld = async (): Promise<void> => {
  if (!currentWorldName) {
    return;
  }

  try {
    await clientAdapter.eventBus.send({
      type: "saveWorld",
      payload: {},
    });
  } catch (error) {
    lastServerMessage = `SAVE FAILED: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const updateGame = (input: ReturnType<NativeBridge["pollInput"]>, deltaSeconds: number): void => {
  if (input.exit) {
    nativeBridge.requestClose();
  }

  void clientWorldRuntime.requestChunksAroundPosition(player.state.position, ACTIVE_CHUNK_RADIUS);
  player.update(input, deltaSeconds, clientWorldRuntime.world);

  const hit = raycastVoxel(
    clientWorldRuntime.world,
    player.getEyePositionVec3(),
    player.getForwardVector(),
    8,
  );

  if (hit && input.breakBlock && !previousPrimaryDown) {
    clientAdapter.eventBus.send({
      type: "mutateBlock",
      payload: {
        x: hit.hit.x,
        y: hit.hit.y,
        z: hit.hit.z,
        blockId: 0,
      },
    });
  }

  if (hit && input.placeBlock && !previousSecondaryDown) {
    clientAdapter.eventBus.send({
      type: "mutateBlock",
      payload: {
        x: hit.place.x,
        y: hit.place.y,
        z: hit.place.z,
        blockId: 3,
      },
    });
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
    clientWorldRuntime.world,
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

clientAdapter.eventBus.on("chunkDelivered", ({ chunk }) => {
  clientWorldRuntime.applyChunk(chunk);
});

clientAdapter.eventBus.on("chunkChanged", ({ chunk }) => {
  clientWorldRuntime.applyChunk(chunk);
});

clientAdapter.eventBus.on("saveStatus", ({ worldName, savedChunks, success, error }) => {
  lastServerMessage = success
    ? `SAVED ${worldName} (${savedChunks} CHUNKS)`
    : `SAVE FAILED: ${error ?? "UNKNOWN ERROR"}`;
  menuState = setMenuStatus(menuState, lastServerMessage);
});

clientAdapter.eventBus.on("serverError", ({ message }) => {
  lastServerMessage = `SERVER ERROR: ${message}`;
  menuState = setMenuStatus(menuState, lastServerMessage);
});

clientAdapter.eventBus.on("worldDeleted", ({ name }) => {
  if (currentWorldName === name) {
    currentWorldName = null;
    clientWorldRuntime.reset();
    appMode = "menu";
    nativeBridge.setCursorDisabled(false);
  }

  void syncMenuWorlds(`DELETED ${name}`);
});

await syncMenuWorlds();

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

      menuState = applyMenuTyping(menuState, input);
      const menu = buildMainMenu(
        input.windowWidth,
        input.windowHeight,
        menuState,
        MENU_SEED,
      );
      const evaluation = evaluateUi(menu, {
        x: input.cursorX,
        y: input.cursorY,
        primaryDown: input.breakBlock,
        primaryPressed,
      });
      uiComponents = evaluation.components;

      for (const action of evaluation.actions) {
        menuState = applyMenuAction(menuState, action);

        if (action === "refresh-worlds" && !menuState.busy) {
          void syncMenuWorlds();
        }

        if (action === "join-world" && !menuState.busy && menuState.selectedWorldName) {
          void joinWorld(menuState.selectedWorldName);
        }

        if (action === "delete-world" && !menuState.busy) {
          void deleteWorld();
        }

        if (action === "create-world" && !menuState.busy) {
          void createWorld();
        }

        if (action === "quit-game") {
          nativeBridge.requestClose();
        }
      }

      if (input.enterPressed && !menuState.busy) {
        void createWorld();
      }
    } else {
      player.applyLook(input);

      while (accumulator >= FIXED_TIMESTEP) {
        updateGame(input, FIXED_TIMESTEP);
        accumulator -= FIXED_TIMESTEP;
      }

      const focusHit = raycastVoxel(
        clientWorldRuntime.world,
        player.getEyePositionVec3(),
        player.getForwardVector(),
        8,
      );
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
          text: `WORLD: ${currentWorldName ?? "NONE"}`,
          x: 20,
          y: 86,
          scale: 3,
          color: [0.98, 0.98, 0.98],
          shadowColor: [0.05, 0.06, 0.08],
        },
        {
          text: lastServerMessage || "SERVER CONNECTED",
          x: 20,
          y: 119,
          scale: 2,
          color: [0.9, 0.92, 0.95],
          shadowColor: [0.05, 0.06, 0.08],
        },
        {
          text: `ROT YAW:${yawDegrees.toFixed(1)} PITCH:${pitchDegrees.toFixed(1)}`,
          x: 20,
          y: 147,
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
  await saveCurrentWorld();
  clientAdapter.close();
  nativeBridge.shutdown();
}
