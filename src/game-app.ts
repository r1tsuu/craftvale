import type { Vec3 } from "./math/vec3.ts";
import {
  applyMenuAction,
  applyMenuTyping,
  createMenuState,
  parseSeedInput,
  setMenuBusy,
  setMenuStatus,
  setMenuWorlds,
  suggestWorldName,
  type MenuState,
} from "./client/menu-state.ts";
import { ClientWorldRuntime } from "./client/world-runtime.ts";
import { WorkerClientAdapter } from "./client/worker-client-adapter.ts";
import { PlayerController } from "./game/player.ts";
import { NativeBridge } from "./platform/native.ts";
import { VoxelRenderer } from "./render/renderer.ts";
import type { TextDrawCommand } from "./render/text.ts";
import { type ClientEventBus } from "./shared/event-bus.ts";
import type { PlayerName } from "./types.ts";
import {
  evaluateUi,
  type UiResolvedComponent,
} from "./ui/components.ts";
import { buildPlayHud } from "./ui/hud.ts";
import { buildMainMenu } from "./ui/menu.ts";
import { Biomes, getBiomeAt } from "./world/biomes.ts";
import { Blocks } from "./world/blocks.ts";
import { ACTIVE_CHUNK_RADIUS } from "./world/constants.ts";
import { getSelectedInventorySlot } from "./world/inventory.ts";
import { raycastVoxel } from "./world/raycast.ts";

const FIXED_TIMESTEP = 1 / 60;

export type AppMode = "menu" | "playing";

export interface GameAppState {
  previousTime: number;
  accumulator: number;
  smoothedFps: number;
  previousPrimaryDown: boolean;
  previousSecondaryDown: boolean;
  appMode: AppMode;
  menuState: MenuState;
  currentWorldName: string | null;
  currentWorldSeed: number | null;
  lastServerMessage: string;
}

export interface GameAppDependencies {
  nativeBridge: NativeBridge;
  clientAdapter: {
    eventBus: ClientEventBus;
    close(): void;
  };
  clientWorldRuntime: ClientWorldRuntime;
  player: PlayerController;
  renderer: VoxelRenderer;
  menuSeed: number;
  playerName: PlayerName;
}

export class GameApp {
  private readonly unsubscribers: Array<() => void> = [];
  private initialized = false;
  private shutdownStarted = false;

  private readonly state: GameAppState = {
    previousTime: 0,
    accumulator: 0,
    smoothedFps: 60,
    previousPrimaryDown: false,
    previousSecondaryDown: false,
    appMode: "menu",
    menuState: createMenuState(),
    currentWorldName: null,
    currentWorldSeed: null,
    lastServerMessage: "",
  };

  public constructor(private readonly deps: GameAppDependencies) {}

  public async run(): Promise<void> {
    await this.initialize();

    try {
      while (!this.deps.nativeBridge.shouldClose()) {
        await this.tick();
      }
    } finally {
      await this.shutdown();
    }
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.state.previousTime = this.deps.nativeBridge.getTime();
    this.registerEventHandlers();
    await this.syncMenuWorlds();
  }

  public async shutdown(): Promise<void> {
    if (this.shutdownStarted) {
      return;
    }

    this.shutdownStarted = true;
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }

    await this.saveCurrentWorld();
    this.deps.clientAdapter.close();
    this.deps.nativeBridge.shutdown();
  }

  private async tick(): Promise<void> {
    const input = this.deps.nativeBridge.pollInput();
    const primaryPressed = input.breakBlock && !this.state.previousPrimaryDown;
    const currentTime = this.deps.nativeBridge.getTime();
    const deltaTime = Math.min(currentTime - this.state.previousTime, 0.25);
    this.state.previousTime = currentTime;
    this.state.accumulator += deltaTime;

    if (deltaTime > 0) {
      const instantaneousFps = 1 / deltaTime;
      this.state.smoothedFps = this.state.smoothedFps * 0.9 + instantaneousFps * 0.1;
    }

    let focusedBlock: Vec3 | null = null;
    let overlayText: TextDrawCommand[] = [];
    let uiComponents: UiResolvedComponent[] = [];

    if (this.state.appMode === "menu") {
      if (input.exit) {
        this.deps.nativeBridge.requestClose();
      }

      this.state.menuState = applyMenuTyping(this.state.menuState, input);
      const menu = buildMainMenu(
        input.windowWidth,
        input.windowHeight,
        this.state.menuState,
        this.deps.menuSeed,
      );
      const evaluation = evaluateUi(menu, {
        x: input.cursorX,
        y: input.cursorY,
        primaryDown: input.breakBlock,
        primaryPressed,
      });
      uiComponents = evaluation.components;

      for (const action of evaluation.actions) {
        await this.handleMenuAction(action);
      }

      if (
        input.enterPressed &&
        !this.state.menuState.busy &&
        this.state.menuState.activeScreen === "create-world"
      ) {
        void this.createWorld();
      }
    } else {
      this.deps.player.applyLook(input);

      while (this.state.accumulator >= FIXED_TIMESTEP) {
        this.updateGame(input, FIXED_TIMESTEP);
        this.state.accumulator -= FIXED_TIMESTEP;
      }

      const focusHit = raycastVoxel(
        this.deps.clientWorldRuntime.world,
        this.deps.player.getEyePositionVec3(),
        this.deps.player.getForwardVector(),
        8,
      );
      const [x, y, z] = this.deps.player.state.position;
      const yawDegrees = (this.deps.player.state.yaw * 180) / Math.PI;
      const pitchDegrees = (this.deps.player.state.pitch * 180) / Math.PI;
      const biomeName = this.getCurrentBiomeName(x, z);

      focusedBlock = focusHit?.hit ?? null;
      overlayText = this.buildOverlayText(
        x,
        y,
        z,
        yawDegrees,
        pitchDegrees,
      );
      uiComponents = buildPlayHud(
        input.windowWidth,
        input.windowHeight,
        this.deps.clientWorldRuntime.inventory,
        biomeName,
      );
    }

    this.renderFrame(
      input.framebufferWidth,
      input.framebufferHeight,
      input.windowWidth,
      input.windowHeight,
      focusedBlock,
      overlayText,
      uiComponents,
    );
    this.state.previousPrimaryDown = input.breakBlock;
    this.state.previousSecondaryDown = input.placeBlock;
    await Bun.sleep(0);
  }

  private async handleMenuAction(action: string): Promise<void> {
    this.state.menuState = applyMenuAction(this.state.menuState, action);

    if (action === "open-worlds" && !this.state.menuState.busy && this.state.menuState.worlds.length === 0) {
      await this.syncMenuWorlds();
      return;
    }

    if (action === "refresh-worlds" && !this.state.menuState.busy) {
      await this.syncMenuWorlds();
      return;
    }

    if (action === "join-world" && !this.state.menuState.busy && this.state.menuState.selectedWorldName) {
      await this.joinWorld(this.state.menuState.selectedWorldName);
      return;
    }

    if (action === "delete-world" && !this.state.menuState.busy) {
      await this.deleteWorld();
      return;
    }

    if (action === "create-world" && !this.state.menuState.busy) {
      await this.createWorld();
      return;
    }

    if (action === "quit-game") {
      this.deps.nativeBridge.requestClose();
    }
  }

  private registerEventHandlers(): void {
    this.unsubscribers.push(
      this.deps.clientAdapter.eventBus.on("chunkDelivered", ({ chunk }) => {
        this.deps.clientWorldRuntime.applyChunk(chunk);
      }),
      this.deps.clientAdapter.eventBus.on("chunkChanged", ({ chunk }) => {
        this.deps.clientWorldRuntime.applyChunk(chunk);
      }),
      this.deps.clientAdapter.eventBus.on("inventoryUpdated", ({ playerName, inventory }) => {
        if (playerName !== this.deps.clientWorldRuntime.clientPlayerName) {
          return;
        }

        this.deps.clientWorldRuntime.applyInventory(inventory);
        if (this.state.lastServerMessage.startsWith("OUT OF ")) {
          this.state.lastServerMessage = "";
        }
      }),
      this.deps.clientAdapter.eventBus.on("playerJoined", ({ player }) => {
        this.deps.clientWorldRuntime.applyPlayer(player);
      }),
      this.deps.clientAdapter.eventBus.on("playerUpdated", ({ player }) => {
        this.deps.clientWorldRuntime.applyPlayer(player);
        if (player.name === this.deps.clientWorldRuntime.clientPlayerName) {
          this.deps.player.syncFromState(player.state);
        }
      }),
      this.deps.clientAdapter.eventBus.on("playerLeft", ({ playerName }) => {
        this.deps.clientWorldRuntime.removePlayer(playerName);
      }),
      this.deps.clientAdapter.eventBus.on("saveStatus", ({ worldName, savedChunks, success, error }) => {
        this.state.lastServerMessage = success
          ? `SAVED ${worldName} (${savedChunks} CHUNKS)`
          : `SAVE FAILED: ${error ?? "UNKNOWN ERROR"}`;
        this.state.menuState = setMenuStatus(this.state.menuState, this.state.lastServerMessage);
      }),
      this.deps.clientAdapter.eventBus.on("serverError", ({ message }) => {
        this.state.lastServerMessage = `SERVER ERROR: ${message}`;
        this.state.menuState = setMenuStatus(this.state.menuState, this.state.lastServerMessage);
      }),
      this.deps.clientAdapter.eventBus.on("worldDeleted", ({ name }) => {
        if (this.state.currentWorldName === name) {
          this.state.currentWorldName = null;
          this.state.currentWorldSeed = null;
          this.deps.clientWorldRuntime.reset();
          this.state.appMode = "menu";
          this.deps.nativeBridge.setCursorDisabled(false);
        }

        void this.syncMenuWorlds(`DELETED ${name}`);
      }),
    );
  }

  private buildOverlayText(
    x: number,
    y: number,
    z: number,
    yawDegrees: number,
    pitchDegrees: number,
  ): TextDrawCommand[] {
    return [
      {
        text: `FPS: ${this.state.smoothedFps.toFixed(1)}`,
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
        text: `WORLD: ${this.state.currentWorldName ?? "NONE"}`,
        x: 20,
        y: 86,
        scale: 3,
        color: [0.98, 0.98, 0.98],
        shadowColor: [0.05, 0.06, 0.08],
      },
      {
        text: this.state.lastServerMessage || "SERVER CONNECTED",
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

  private getCurrentBiomeName(worldX: number, worldZ: number): string | null {
    if (this.state.currentWorldSeed === null) {
      return null;
    }

    const biomeId = getBiomeAt(
      this.state.currentWorldSeed,
      Math.floor(worldX),
      Math.floor(worldZ),
    );
    return Biomes[biomeId].name.toUpperCase();
  }

  private async syncMenuWorlds(statusText = "SELECT OR CREATE A WORLD"): Promise<void> {
    this.state.menuState = setMenuBusy(this.state.menuState, true, "LOADING WORLDS...");

    try {
      const response = await this.deps.clientAdapter.eventBus.send({
        type: "listWorlds",
        payload: {},
      });
      this.state.menuState = setMenuWorlds(
        {
          ...this.state.menuState,
          busy: false,
          statusText,
        },
        response.worlds,
      );
    } catch (error) {
      this.state.menuState = setMenuBusy(
        setMenuStatus(
          this.state.menuState,
          `FAILED TO LOAD WORLDS: ${error instanceof Error ? error.message : String(error)}`,
        ),
        false,
      );
    }
  }

  private async joinWorld(worldName: string): Promise<void> {
    this.state.menuState = setMenuBusy(this.state.menuState, true, `JOINING ${worldName}...`);

    try {
      const joined = await this.deps.clientAdapter.eventBus.send({
        type: "joinWorld",
        payload: {
          name: worldName,
          playerName: this.deps.playerName,
        },
      });

      this.deps.clientWorldRuntime.reset();
      this.deps.clientWorldRuntime.applyJoinedWorld(joined);
      this.state.currentWorldName = joined.world.name;
      this.state.currentWorldSeed = joined.world.seed;
      this.deps.player.resetFromState(joined.clientPlayer.state);

      const initialCoords = this.deps.clientWorldRuntime.getChunkCoordsAroundPosition(
        joined.clientPlayer.state.position,
        ACTIVE_CHUNK_RADIUS,
      );
      await this.deps.clientWorldRuntime.requestMissingChunks(initialCoords);
      await this.deps.clientWorldRuntime.waitForChunks(initialCoords);

      this.state.appMode = "playing";
      this.deps.nativeBridge.setCursorDisabled(true);
      this.state.accumulator = 0;
      this.state.lastServerMessage = "";
      this.state.menuState = setMenuBusy(
        setMenuStatus(this.state.menuState, `JOINED ${joined.world.name}`),
        false,
      );
    } catch (error) {
      this.state.menuState = setMenuBusy(
        setMenuStatus(
          this.state.menuState,
          `FAILED TO JOIN: ${error instanceof Error ? error.message : String(error)}`,
        ),
        false,
      );
    }
  }

  private async createWorld(): Promise<void> {
    const worldName = this.state.menuState.createWorldName.trim() || suggestWorldName(this.state.menuState.worlds);

    this.state.menuState = setMenuBusy(this.state.menuState, true, "CREATING WORLD...");

    try {
      const seed = parseSeedInput(this.state.menuState.createSeedText);
      const response = await this.deps.clientAdapter.eventBus.send({
        type: "createWorld",
        payload: {
          name: worldName,
          seed,
        },
      });

      const worlds = [...this.state.menuState.worlds, response.world].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      this.state.menuState = setMenuWorlds(
        {
          ...this.state.menuState,
          activeScreen: "worlds",
          busy: false,
          selectedWorldName: response.world.name,
          focusedField: null,
          createWorldName: "",
          createSeedText: "",
          statusText: `CREATED ${response.world.name}`,
        },
        worlds,
      );
    } catch (error) {
      this.state.menuState = setMenuBusy(
        setMenuStatus(
          this.state.menuState,
          `FAILED TO CREATE: ${error instanceof Error ? error.message : String(error)}`,
        ),
        false,
      );
    }
  }

  private async deleteWorld(): Promise<void> {
    if (!this.state.menuState.selectedWorldName) {
      this.state.menuState = setMenuStatus(this.state.menuState, "SELECT A WORLD TO DELETE");
      return;
    }

    const worldName = this.state.menuState.selectedWorldName;
    this.state.menuState = setMenuBusy(this.state.menuState, true, `DELETING ${worldName}...`);

    try {
      await this.deps.clientAdapter.eventBus.send({
        type: "deleteWorld",
        payload: { name: worldName },
      });
      await this.syncMenuWorlds(`DELETED ${worldName}`);
    } catch (error) {
      this.state.menuState = setMenuBusy(
        setMenuStatus(
          this.state.menuState,
          `FAILED TO DELETE: ${error instanceof Error ? error.message : String(error)}`,
        ),
        false,
      );
    }
  }

  private async saveCurrentWorld(): Promise<void> {
    if (!this.state.currentWorldName) {
      return;
    }

    try {
      await this.deps.clientAdapter.eventBus.send({
        type: "saveWorld",
        payload: {},
      });
    } catch (error) {
      this.state.lastServerMessage =
        `SAVE FAILED: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private updateGame(
    input: ReturnType<NativeBridge["pollInput"]>,
    deltaSeconds: number,
  ): void {
    if (input.exit) {
      this.deps.nativeBridge.requestClose();
    }

    if (input.hotbarSelection !== null) {
      this.deps.clientAdapter.eventBus.send({
        type: "selectInventorySlot",
        payload: {
          slot: input.hotbarSelection,
        },
      });
    }

    void this.deps.clientWorldRuntime.requestChunksAroundPosition(
      this.deps.player.state.position,
      ACTIVE_CHUNK_RADIUS,
    );
    this.deps.player.update(input, deltaSeconds, this.deps.clientWorldRuntime.world);
    const localPlayer = this.deps.clientWorldRuntime.createLocalPlayerSnapshot(this.deps.player.state);
    if (localPlayer) {
      this.deps.clientWorldRuntime.applyPlayer(localPlayer);
      this.deps.clientAdapter.eventBus.send({
        type: "updatePlayerState",
        payload: {
          state: {
            position: [...this.deps.player.state.position],
            yaw: this.deps.player.state.yaw,
            pitch: this.deps.player.state.pitch,
          },
        },
      });
    }

    const hit = raycastVoxel(
      this.deps.clientWorldRuntime.world,
      this.deps.player.getEyePositionVec3(),
      this.deps.player.getForwardVector(),
      8,
    );

    if (hit && input.breakBlock && !this.state.previousPrimaryDown) {
      this.deps.clientAdapter.eventBus.send({
        type: "mutateBlock",
        payload: {
          x: hit.hit.x,
          y: hit.hit.y,
          z: hit.hit.z,
          blockId: 0,
        },
      });
    }

    if (hit && input.placeBlock && !this.state.previousSecondaryDown) {
      const selectedSlot = getSelectedInventorySlot(this.deps.clientWorldRuntime.inventory);
      if (selectedSlot.count <= 0) {
        this.state.lastServerMessage = `OUT OF ${Blocks[selectedSlot.blockId].name.toUpperCase()}`;
        return;
      }

      this.deps.clientAdapter.eventBus.send({
        type: "mutateBlock",
        payload: {
          x: hit.place.x,
          y: hit.place.y,
          z: hit.place.z,
          blockId: selectedSlot.blockId,
        },
      });
    }
  }

  private renderFrame(
    framebufferWidth: number,
    framebufferHeight: number,
    windowWidth: number,
    windowHeight: number,
    focusedBlock: Vec3 | null,
    overlayText: readonly TextDrawCommand[],
    uiComponents: readonly UiResolvedComponent[],
  ): void {
    this.deps.nativeBridge.beginFrame();
    this.deps.renderer.render(
      this.deps.clientWorldRuntime.world,
      this.deps.player,
      framebufferWidth,
      framebufferHeight,
      focusedBlock,
      overlayText,
      uiComponents,
      windowWidth,
      windowHeight,
    );
    this.deps.nativeBridge.endFrame();
  }
}

export const createDefaultGameApp = (options: { playerName: PlayerName }): GameApp => {
  const menuSeed = (Date.now() ^ 0x5f3759df) >>> 0;
  const nativeBridge = new NativeBridge();
  nativeBridge.initWindow({
    width: 1440,
    height: 900,
    title: "Minecraft Clone",
  });
  nativeBridge.setCursorDisabled(false);

  const clientAdapter = new WorkerClientAdapter();
  const clientWorldRuntime = new ClientWorldRuntime(clientAdapter);
  const player = new PlayerController();
  const renderer = new VoxelRenderer(nativeBridge);

  return new GameApp({
    nativeBridge,
    clientAdapter,
    clientWorldRuntime,
    player,
    renderer,
    menuSeed,
    playerName: options.playerName,
  });
};
