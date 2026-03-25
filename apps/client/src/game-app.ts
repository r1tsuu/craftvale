import type { Vec3 } from "@voxel/core/shared";
import {
  cloneClientSettings,
  createDefaultClientSettings,
  normalizeClientSettings,
  type JsonClientSettingsStorage,
} from "./client/client-settings.ts";
import {
  applyMenuAction,
  applyMenuTyping,
  createMenuState,
  parseSeedInput,
  setMenuBusy,
  setMenuServers,
  setMenuStatus,
  setMenuWorlds,
  suggestWorldName,
  type MenuState,
} from "./client/menu-state.ts";
import {
  JsonSavedServerStorage,
  isValidSavedServerAddress,
  isValidSavedServerName,
} from "./client/saved-servers.ts";
import { LocalWorldStorage } from "./client/local-world-storage.ts";
import { ClientWorldRuntime } from "./client/world-runtime.ts";
import { type IClientAdapter } from "./client/client-adapter.ts";
import { WebSocketClientAdapter } from "./client/websocket-client-adapter.ts";
import { WorkerClientAdapter } from "./client/worker-client-adapter.ts";
import {
  isGameplaySuppressed,
  resolvePlayChatOpenDraft,
  resolvePlayChatTypedText,
  resolvePlayEscapeAction,
  shouldLockCursor,
  type PauseScreen,
} from "./game/play-overlay.ts";
import { PlayerController } from "./game/player.ts";
import { NativeBridge } from "./platform/native.ts";
import { VoxelRenderer } from "./render/renderer.ts";
import type { TextDrawCommand } from "./render/text.ts";
import type {
  JoinedWorldPayload,
  LoadingProgressPayload,
  PlayerName,
} from "@voxel/core/shared";
import type { ClientSettings } from "./types.ts";
import { evaluateUi, type UiResolvedComponent } from "./ui/components.ts";
import { buildPlayHud } from "./ui/hud.ts";
import { buildLoadingScreen } from "./ui/loading.ts";
import { buildMainMenu } from "./ui/menu.ts";
import {
  Biomes,
  STARTUP_CHUNK_RADIUS,
  VoxelWorld,
  createDefaultInventory,
  createLogger,
  getBiomeAt,
  getItemDisplayName,
  getPlacedBlockIdForItem,
  getSelectedInventorySlot,
  raycastVoxel,
} from "@voxel/core/shared";

const FIXED_TIMESTEP = 1 / 60;
const FIRST_PERSON_SWING_DURATION = 0.18;
const appLogger = createLogger("app", "cyan");

export type AppMode = "menu" | "loading" | "playing";

export interface WorldLoadingState {
  token: number;
  entryMode: "local" | "remote";
  targetName: string;
  transportLabel: string;
  statusText: string;
  progressPercent: number | null;
}

export interface GameAppState {
  previousTime: number;
  accumulator: number;
  smoothedFps: number;
  previousPrimaryDown: boolean;
  previousSecondaryDown: boolean;
  firstPersonSwingRemaining: number;
  appMode: AppMode;
  menuState: MenuState;
  loadingState: WorldLoadingState | null;
  currentWorldName: string | null;
  currentWorldSeed: number | null;
  lastServerMessage: string;
  chatOpen: boolean;
  chatDraft: string;
  inventoryOpen: boolean;
  pauseScreen: PauseScreen;
  clientSettings: ClientSettings;
}

export interface GameAppDependencies {
  nativeBridge: NativeBridge;
  player: PlayerController;
  renderer: VoxelRenderer;
  menuSeed: number;
  playerName: PlayerName;
  clientSettings: ClientSettings;
  clientSettingsStorage: JsonClientSettingsStorage;
  savedServerStorage: JsonSavedServerStorage;
  localWorldStorage: LocalWorldStorage;
}

export class GameApp {
  private readonly connectionUnsubscribers: Array<() => void> = [];
  private initialized = false;
  private shutdownStarted = false;
  private settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private settingsSavePromise: Promise<void> | null = null;
  private clientAdapter: IClientAdapter | null = null;
  private clientWorldRuntime: ClientWorldRuntime | null = null;
  private connectionMode: "local" | "remote" | null = null;
  private connectedServerAddress: string | null = null;
  private nextLoadingToken = 0;

  private readonly state: GameAppState;

  public constructor(private readonly deps: GameAppDependencies) {
    this.state = {
      previousTime: 0,
      accumulator: 0,
      smoothedFps: 60,
      previousPrimaryDown: false,
      previousSecondaryDown: false,
      firstPersonSwingRemaining: 0,
      appMode: "menu",
      menuState: createMenuState(),
      loadingState: null,
      currentWorldName: null,
      currentWorldSeed: null,
      lastServerMessage: "",
      chatOpen: false,
      chatDraft: "",
      inventoryOpen: false,
      pauseScreen: "closed",
      clientSettings: cloneClientSettings(
        normalizeClientSettings(
          deps.clientSettings ?? createDefaultClientSettings(),
        ),
      ),
    };
    this.applyClientSettings(this.state.clientSettings);
  }

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
    this.logInfo(`starting desktop app as "${this.deps.playerName}"`);
    this.state.previousTime = this.deps.nativeBridge.getTime();
    await this.syncSavedServers();
  }

  public async shutdown(): Promise<void> {
    if (this.shutdownStarted) {
      return;
    }

    this.shutdownStarted = true;
    this.logInfo("shutting down desktop app");
    await this.flushSettingsSave();
    await this.saveCurrentWorld();
    this.disconnectClient();
    this.deps.nativeBridge.shutdown();
  }

  private async tick(): Promise<void> {
    const input = this.deps.nativeBridge.pollInput();
    const primaryPressed = input.breakBlock && !this.state.previousPrimaryDown;
    const currentTime = this.deps.nativeBridge.getTime();
    const deltaTime = Math.min(currentTime - this.state.previousTime, 0.25);
    this.state.previousTime = currentTime;
    this.state.accumulator += deltaTime;
    this.state.firstPersonSwingRemaining = Math.max(
      0,
      this.state.firstPersonSwingRemaining - deltaTime,
    );

    if (deltaTime > 0) {
      const instantaneousFps = 1 / deltaTime;
      this.state.smoothedFps =
        this.state.smoothedFps * 0.9 + instantaneousFps * 0.1;
    }

    let focusedBlock: Vec3 | null = null;
    let overlayText: TextDrawCommand[] = [];
    let uiComponents: UiResolvedComponent[] = [];

    if (this.state.appMode === "menu") {
      this.state.menuState = applyMenuTyping(this.state.menuState, input);
      const menu = buildMainMenu(
        input.windowWidth,
        input.windowHeight,
        {
          ...this.state.menuState,
          settings: this.state.clientSettings,
        },
        this.deps.menuSeed,
      );
      const evaluation = evaluateUi(menu, {
        x: input.cursorX,
        y: input.cursorY,
        primaryDown: input.breakBlock,
        primaryPressed,
      });
      uiComponents = evaluation.components;

      for (const change of evaluation.sliderChanges) {
        this.handleMenuSliderChange(change.action, change.value);
      }

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
    } else if (this.state.appMode === "loading") {
      const loadingState = this.state.loadingState;
      if (loadingState) {
        uiComponents = evaluateUi(
          buildLoadingScreen(
            input.windowWidth,
            input.windowHeight,
            {
              targetName: loadingState.targetName,
              transportLabel: loadingState.transportLabel,
              statusText: loadingState.statusText,
              progressPercent: loadingState.progressPercent,
            },
            this.deps.menuSeed,
          ),
          {
            x: input.cursorX,
            y: input.cursorY,
            primaryDown: false,
            primaryPressed: false,
          },
        ).components;
      }
    } else {
      const worldRuntime = this.getWorldRuntime();
      this.handlePlayOverlayInput(input);
      if (
        (primaryPressed || (input.placeBlock && !this.state.previousSecondaryDown)) &&
        !isGameplaySuppressed({
          chatOpen: this.state.chatOpen,
          inventoryOpen: this.state.inventoryOpen,
          pauseScreen: this.state.pauseScreen,
        })
      ) {
        this.state.firstPersonSwingRemaining = FIRST_PERSON_SWING_DURATION;
      }
      if (
        !this.state.chatOpen &&
        !this.state.inventoryOpen &&
        this.state.pauseScreen === "closed"
      ) {
        this.deps.player.applyLook(input);
      }

      while (this.state.accumulator >= FIXED_TIMESTEP) {
        this.updateGame(input, FIXED_TIMESTEP);
        this.state.accumulator -= FIXED_TIMESTEP;
      }

      const focusHit = raycastVoxel(
        worldRuntime.world,
        this.deps.player.getEyePositionVec3(),
        this.deps.player.getForwardVector(),
        8,
      );
      const [x, y, z] = this.deps.player.state.position;
      const yawDegrees = (this.deps.player.state.yaw * 180) / Math.PI;
      const pitchDegrees = (this.deps.player.state.pitch * 180) / Math.PI;
      const biomeName = this.getCurrentBiomeName(x, z);

      focusedBlock = focusHit?.hit ?? null;
      overlayText = this.state.clientSettings.showDebugOverlay
        ? this.buildOverlayText(x, y, z, yawDegrees, pitchDegrees)
        : [];
      const playHud = buildPlayHud(input.windowWidth, input.windowHeight, {
        inventory: worldRuntime.inventory,
        inventoryOpen: this.state.inventoryOpen,
        cursorX: input.cursorX,
        cursorY: input.cursorY,
        showCrosshair: this.state.clientSettings.showCrosshair,
        pauseScreen: this.state.pauseScreen,
        pauseSettings:
          this.state.pauseScreen === "settings"
            ? {
                settings: this.state.clientSettings,
                statusText:
                  this.state.lastServerMessage ||
                  "ADJUST SETTINGS AND GO BACK TO RESUME",
                busy: false,
              }
            : undefined,
        biomeName,
        chatMessages: worldRuntime.chatMessages,
        chatNowMs: Date.now(),
        chatDraft: this.state.chatDraft,
        chatOpen: this.state.chatOpen,
        gamemode: worldRuntime.getClientPlayer()?.gamemode ?? 0,
        flying: worldRuntime.getClientPlayer()?.flying ?? false,
      });
      const evaluation = evaluateUi(playHud, {
        x: input.cursorX,
        y: input.cursorY,
        primaryDown: input.breakBlock,
        primaryPressed,
      });
      uiComponents = evaluation.components;
      for (const change of evaluation.sliderChanges) {
        this.handleMenuSliderChange(change.action, change.value);
      }
      for (const action of evaluation.actions) {
        await this.handlePlayHudAction(action);
      }
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

  private getClientAdapter(): IClientAdapter {
    if (!this.clientAdapter) {
      throw new Error("No client adapter is connected.");
    }

    return this.clientAdapter;
  }

  private getWorldRuntime(): ClientWorldRuntime {
    if (!this.clientWorldRuntime) {
      throw new Error("No client world runtime is connected.");
    }

    return this.clientWorldRuntime;
  }

  private disconnectClient(): void {
    if (this.clientAdapter) {
      this.logInfo(
        `disconnecting ${this.connectionMode ?? "unknown"} session${this.state.currentWorldName ? ` for "${this.state.currentWorldName}"` : ""}`,
      );
    }
    for (const unsubscribe of this.connectionUnsubscribers.splice(0)) {
      unsubscribe();
    }

    this.clientAdapter?.close();
    this.clientAdapter = null;
    this.clientWorldRuntime = null;
    this.connectionMode = null;
    this.connectedServerAddress = null;
  }

  private async connectLocalClient(worldName: string): Promise<void> {
    const world = await this.deps.localWorldStorage.getWorldRecord(worldName);
    if (!world) {
      throw new Error(`World "${worldName}" does not exist.`);
    }

    this.logInfo(`connecting local singleplayer worker for "${worldName}"`);
    this.disconnectClient();
    const adapter = new WorkerClientAdapter({
      storageRoot: this.deps.localWorldStorage.storageRoot,
      world,
    });
    this.clientAdapter = adapter;
    this.clientWorldRuntime = new ClientWorldRuntime(adapter);
    this.connectionMode = "local";
    this.registerConnectionEventHandlers();
  }

  private async connectRemoteClient(address: string): Promise<void> {
    const normalizedAddress = address.trim();
    if (
      this.connectionMode === "remote" &&
      this.connectedServerAddress === normalizedAddress &&
      this.clientAdapter &&
      this.clientWorldRuntime
    ) {
      return;
    }

    this.logInfo(`connecting to multiplayer server at ${normalizedAddress}`);
    this.disconnectClient();
    const adapter = await WebSocketClientAdapter.connect(this.toWebSocketUrl(normalizedAddress));
    this.clientAdapter = adapter;
    this.clientWorldRuntime = new ClientWorldRuntime(adapter);
    this.connectionMode = "remote";
    this.connectedServerAddress = normalizedAddress;
    this.registerConnectionEventHandlers();
  }

  private toWebSocketUrl(address: string): string {
    if (address.startsWith("ws://") || address.startsWith("wss://")) {
      return `${address.replace(/\/+$/, "")}/ws`;
    }

    return `ws://${address.replace(/\/+$/, "")}/ws`;
  }

  private async handleMenuAction(action: string): Promise<void> {
    this.state.menuState = applyMenuAction(this.state.menuState, action);

    if (this.handleSharedSettingsAction(action)) {
      return;
    }

    if (action === "back-to-play" && !this.state.menuState.busy && this.state.appMode === "menu") {
      this.disconnectClient();
      await this.syncSavedServers("SELECT A MODE");
      return;
    }

    if (action === "open-worlds" && !this.state.menuState.busy) {
      await this.syncMenuWorlds();
      return;
    }

    if (action === "open-multiplayer" && !this.state.menuState.busy) {
      await this.syncSavedServers("SELECT A SERVER");
      return;
    }

    if (action === "refresh-worlds" && !this.state.menuState.busy) {
      await this.syncMenuWorlds();
      return;
    }

    if (
      action === "join-world" &&
      !this.state.menuState.busy &&
      this.state.menuState.selectedWorldName
    ) {
      void this.joinWorld(this.state.menuState.selectedWorldName);
      return;
    }

    if (
      action === "join-server" &&
      !this.state.menuState.busy &&
      this.state.menuState.selectedServerId
    ) {
      void this.joinServer(this.state.menuState.selectedServerId);
      return;
    }

    if (action === "save-server" && !this.state.menuState.busy) {
      await this.saveServer();
      return;
    }

    if (action.startsWith("delete-server:") && !this.state.menuState.busy) {
      await this.deleteServer(action.slice("delete-server:".length));
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
      this.logInfo("quit requested from menu");
      this.deps.nativeBridge.requestClose();
    }
  }

  private handleMenuSliderChange(action: string, value: number): void {
    if (action === "set-setting:fovDegrees") {
      this.updateClientSettings({ fovDegrees: value });
      return;
    }

    if (action === "set-setting:mouseSensitivity") {
      this.updateClientSettings({ mouseSensitivity: value });
      return;
    }

    if (action === "set-setting:renderDistance") {
      this.updateClientSettings({ renderDistance: value });
    }
  }

  private handleSharedSettingsAction(action: string): boolean {
    if (action === "toggle-setting:showDebugOverlay") {
      this.updateClientSettings({
        showDebugOverlay: !this.state.clientSettings.showDebugOverlay,
      });
      return true;
    }

    if (action === "toggle-setting:showCrosshair") {
      this.updateClientSettings({
        showCrosshair: !this.state.clientSettings.showCrosshair,
      });
      return true;
    }

    if (action === "reset-settings") {
      this.updateClientSettings(createDefaultClientSettings());
      return true;
    }

    return false;
  }

  private registerConnectionEventHandlers(): void {
    const adapter = this.getClientAdapter();
    const worldRuntime = this.getWorldRuntime();

    this.connectionUnsubscribers.push(
      adapter.eventBus.on("chunkDelivered", ({ chunk }) => {
        worldRuntime.applyChunk(chunk);
      }),
      adapter.eventBus.on("chunkChanged", ({ chunk }) => {
        worldRuntime.applyChunk(chunk);
      }),
      adapter.eventBus.on(
        "inventoryUpdated",
        ({ playerEntityId, inventory }) => {
          if (playerEntityId !== worldRuntime.clientPlayerEntityId) {
            return;
          }

          worldRuntime.applyInventory(inventory);
          if (this.state.lastServerMessage.startsWith("OUT OF ")) {
            this.state.lastServerMessage = "";
          }
        },
      ),
      adapter.eventBus.on("droppedItemSpawned", ({ item }) => {
        worldRuntime.applyDroppedItem(item);
      }),
      adapter.eventBus.on("droppedItemUpdated", ({ item }) => {
        worldRuntime.applyDroppedItem(item);
      }),
      adapter.eventBus.on("droppedItemRemoved", ({ entityId }) => {
        worldRuntime.removeDroppedItem(entityId);
      }),
      adapter.eventBus.on("playerJoined", ({ player }) => {
        worldRuntime.applyPlayer(player);
      }),
      adapter.eventBus.on("playerUpdated", ({ player }) => {
        worldRuntime.applyPlayer(player);
        if (player.entityId === worldRuntime.clientPlayerEntityId) {
          this.deps.player.syncFromSnapshot(player);
        }
      }),
      adapter.eventBus.on("playerLeft", ({ playerEntityId, playerName }) => {
        worldRuntime.removePlayer(playerEntityId, playerName);
      }),
      adapter.eventBus.on("chatMessage", ({ entry }) => {
        worldRuntime.appendChatMessage(entry);
      }),
      adapter.eventBus.on("loadingProgress", (progress) => {
        this.applyLoadingProgress(progress);
      }),
      adapter.eventBus.on(
        "saveStatus",
        ({ worldName, savedChunks, success, error }) => {
          this.state.lastServerMessage = success
            ? `SAVED ${worldName} (${savedChunks} CHUNKS)`
            : `SAVE FAILED: ${error ?? "UNKNOWN ERROR"}`;
          this.state.menuState = setMenuStatus(
            this.state.menuState,
            this.state.lastServerMessage,
          );
        },
      ),
      adapter.eventBus.on("serverError", ({ message }) => {
        if (this.state.appMode === "loading" && this.state.loadingState) {
          this.state.loadingState = {
            ...this.state.loadingState,
            statusText: `SERVER ERROR: ${message}`,
          };
        }
        this.state.lastServerMessage = `SERVER ERROR: ${message}`;
        this.state.menuState = setMenuStatus(
          this.state.menuState,
          this.state.lastServerMessage,
        );
      }),
      adapter.eventBus.on("worldDeleted", ({ name }) => {
        if (this.state.currentWorldName === name) {
          this.state.loadingState = null;
          this.state.currentWorldName = null;
          this.state.currentWorldSeed = null;
          worldRuntime.reset();
          this.state.appMode = "menu";
          this.state.chatOpen = false;
          this.state.chatDraft = "";
          this.state.inventoryOpen = false;
          this.state.pauseScreen = "closed";
          this.syncCursorMode();
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

  private async syncMenuWorlds(
    statusText = "SELECT OR CREATE A WORLD",
  ): Promise<void> {
    this.state.menuState = setMenuBusy(
      this.state.menuState,
      true,
      "LOADING WORLDS...",
    );

    try {
      const worlds = await this.deps.localWorldStorage.listWorlds();
      this.state.menuState = setMenuWorlds(
        {
          ...this.state.menuState,
          busy: false,
          statusText,
        },
        worlds,
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

  private async syncSavedServers(
    statusText = "SELECT A MODE",
  ): Promise<void> {
    const servers = await this.deps.savedServerStorage.loadServers();
    this.state.menuState = setMenuServers(
      setMenuStatus(this.state.menuState, statusText),
      servers,
    );
  }

  private async joinWorld(worldName: string): Promise<void> {
    this.logInfo(`joining local world "${worldName}"`);
    const loadingToken = this.beginLoading({
      entryMode: "local",
      targetName: worldName,
      transportLabel: "LOCAL SINGLEPLAYER",
      statusText: `STARTING ${worldName.toUpperCase()}...`,
      progressPercent: null,
    });
    this.state.menuState = setMenuBusy(
      this.state.menuState,
      true,
      `JOINING ${worldName}...`,
    );

    try {
      await this.connectLocalClient(worldName);
      if (!this.isLoadingTokenActive(loadingToken)) {
        return;
      }

      this.updateLoadingState(loadingToken, {
        statusText: "JOINING WORLD...",
      });
      const joined = await this.getClientAdapter().eventBus.send({
        type: "joinWorld",
        payload: {
          playerName: this.deps.playerName,
        },
      });

      await this.completeWorldJoinLoading(loadingToken, joined, {
        successStatusText: `JOINED ${joined.world.name}`,
        connectedMessage: "",
      });
    } catch (error) {
      this.failLoading(
        loadingToken,
        `FAILED TO JOIN: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async joinServer(serverId: string): Promise<void> {
    const server = this.state.menuState.servers.find((entry) => entry.id === serverId);
    if (!server) {
      this.state.menuState = setMenuStatus(
        this.state.menuState,
        "SELECT A SERVER TO JOIN",
      );
      return;
    }

    this.logInfo(`joining multiplayer server "${server.name}" at ${server.address}`);
    const loadingToken = this.beginLoading({
      entryMode: "remote",
      targetName: server.name,
      transportLabel: "MULTIPLAYER SERVER",
      statusText: `CONNECTING TO ${server.name.toUpperCase()}...`,
      progressPercent: null,
    });
    this.state.menuState = setMenuBusy(
      this.state.menuState,
      true,
      `CONNECTING TO ${server.name.toUpperCase()}...`,
    );

    try {
      await this.connectRemoteClient(server.address);
      if (!this.isLoadingTokenActive(loadingToken)) {
        return;
      }

      this.updateLoadingState(loadingToken, {
        statusText: "JOINING SERVER...",
      });
      const joined = await this.getClientAdapter().eventBus.send({
        type: "joinServer",
        payload: {
          playerName: this.deps.playerName,
        },
      });

      await this.completeWorldJoinLoading(loadingToken, joined, {
        successStatusText: `JOINED ${server.name}`,
        connectedMessage: `CONNECTED TO ${server.name.toUpperCase()}`,
      });
    } catch (error) {
      this.failLoading(
        loadingToken,
        `FAILED TO CONNECT: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private beginLoading(
    loadingState: Omit<WorldLoadingState, "token">,
  ): number {
    const token = ++this.nextLoadingToken;
    this.state.loadingState = {
      token,
      ...loadingState,
    };
    this.state.appMode = "loading";
    this.state.lastServerMessage = "";
    this.state.accumulator = 0;
    this.syncCursorMode();
    return token;
  }

  private isLoadingTokenActive(token: number): boolean {
    return this.state.appMode === "loading" && this.state.loadingState?.token === token;
  }

  private updateLoadingState(
    token: number,
    partial: Partial<Omit<WorldLoadingState, "token">>,
  ): void {
    if (!this.isLoadingTokenActive(token) || !this.state.loadingState) {
      return;
    }

    this.state.loadingState = {
      ...this.state.loadingState,
      ...partial,
    };
  }

  private applyLoadingProgress(progress: LoadingProgressPayload): void {
    if (
      this.state.appMode !== "loading" ||
      !this.state.loadingState ||
      this.state.loadingState.entryMode !== "local"
    ) {
      return;
    }

    this.state.loadingState = {
      ...this.state.loadingState,
      targetName: progress.worldName,
      statusText: progress.statusText,
      progressPercent:
        progress.totalUnits > 0
          ? (progress.completedUnits / progress.totalUnits) * 100
          : null,
    };
  }

  private getStartupChunkRadius(): number {
    return Math.max(
      0,
      Math.min(STARTUP_CHUNK_RADIUS, this.state.clientSettings.renderDistance),
    );
  }

  private async completeWorldJoinLoading(
    loadingToken: number,
    joined: JoinedWorldPayload,
    options: {
      successStatusText: string;
      connectedMessage: string;
    },
  ): Promise<void> {
    if (!this.isLoadingTokenActive(loadingToken)) {
      return;
    }

    const worldRuntime = this.getWorldRuntime();
    worldRuntime.reset();
    worldRuntime.applyJoinedWorld(joined);
    this.state.currentWorldName = joined.world.name;
    this.state.currentWorldSeed = joined.world.seed;
    this.state.chatOpen = false;
    this.state.chatDraft = "";
    this.state.inventoryOpen = false;
    this.state.pauseScreen = "closed";
    this.deps.player.resetFromSnapshot(joined.clientPlayer);

    const initialCoords = worldRuntime.getStartupChunkCoordsAroundPosition(
      joined.clientPlayer.state.position,
      this.getStartupChunkRadius(),
    );
    const currentLoadingState = this.state.loadingState;
    this.updateLoadingState(loadingToken, {
      targetName: joined.world.name,
      statusText: "WAITING FOR STARTUP CHUNKS...",
      progressPercent:
        currentLoadingState?.entryMode === "local"
          ? currentLoadingState.progressPercent
          : null,
    });
    await worldRuntime.requestMissingChunks(initialCoords);
    await worldRuntime.waitForChunks(initialCoords);
    if (!this.isLoadingTokenActive(loadingToken)) {
      return;
    }

    this.state.loadingState = null;
    this.state.appMode = "playing";
    this.syncCursorMode();
    this.state.accumulator = 0;
    this.state.lastServerMessage = options.connectedMessage;
    this.logInfo(
      `entered ${currentLoadingState?.entryMode === "remote" ? "multiplayer server" : "local world"} "${joined.world.name}"`,
    );
    this.state.menuState = setMenuBusy(
      setMenuStatus(this.state.menuState, options.successStatusText),
      false,
    );
  }

  private failLoading(token: number, statusText: string): void {
    if (!this.isLoadingTokenActive(token)) {
      return;
    }

    this.logInfo(statusText);
    this.disconnectClient();
    this.state.loadingState = null;
    this.state.appMode = "menu";
    this.state.currentWorldName = null;
    this.state.currentWorldSeed = null;
    this.state.chatOpen = false;
    this.state.chatDraft = "";
    this.state.inventoryOpen = false;
    this.state.pauseScreen = "closed";
    this.state.lastServerMessage = statusText;
    this.state.menuState = setMenuBusy(
      setMenuStatus(this.state.menuState, statusText),
      false,
    );
    this.syncCursorMode();
  }

  private async createWorld(): Promise<void> {
    const worldName =
      this.state.menuState.createWorldName.trim() ||
      suggestWorldName(this.state.menuState.worlds);

    this.state.menuState = setMenuBusy(
      this.state.menuState,
      true,
      "CREATING WORLD...",
    );

    try {
      const seed = parseSeedInput(this.state.menuState.createSeedText);
      const world = await this.deps.localWorldStorage.createWorld(worldName, seed);

      const worlds = [...this.state.menuState.worlds, world].sort(
        (left, right) => left.name.localeCompare(right.name),
      );
      this.state.menuState = setMenuWorlds(
        {
          ...this.state.menuState,
          activeScreen: "worlds",
          busy: false,
          selectedWorldName: world.name,
          focusedField: null,
          createWorldName: "",
          createSeedText: "",
          statusText: `CREATED ${world.name}`,
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

  private async saveServer(): Promise<void> {
    const name = this.state.menuState.addServerName.trim();
    const address = this.state.menuState.addServerAddress.trim();

    if (!isValidSavedServerName(name)) {
      this.state.menuState = setMenuStatus(this.state.menuState, "ENTER A SERVER NAME");
      return;
    }

    if (!isValidSavedServerAddress(address)) {
      this.state.menuState = setMenuStatus(this.state.menuState, "ENTER A SERVER ADDRESS");
      return;
    }

    this.state.menuState = setMenuBusy(this.state.menuState, true, "SAVING SERVER...");

    try {
      const servers = await this.deps.savedServerStorage.ensureServer(name, address);
      const saved = servers.find((server) => server.address === address) ?? null;
      this.state.menuState = setMenuServers({
        ...this.state.menuState,
        activeScreen: "multiplayer",
        busy: false,
        selectedServerId: saved?.id ?? this.state.menuState.selectedServerId,
        addServerName: "",
        addServerAddress: "",
        focusedField: null,
        statusText: `SAVED ${name.toUpperCase()}`,
      }, servers);
    } catch (error) {
      this.state.menuState = setMenuBusy(
        setMenuStatus(
          this.state.menuState,
          `FAILED TO SAVE SERVER: ${error instanceof Error ? error.message : String(error)}`,
        ),
        false,
      );
    }
  }

  private async deleteServer(serverId: string): Promise<void> {
    this.state.menuState = setMenuBusy(this.state.menuState, true, "DELETING SERVER...");

    try {
      const servers = await this.deps.savedServerStorage.deleteServer(serverId);
      this.state.menuState = setMenuServers(
        {
          ...this.state.menuState,
          busy: false,
          statusText: "DELETED SERVER",
        },
        servers,
      );
    } catch (error) {
      this.state.menuState = setMenuBusy(
        setMenuStatus(
          this.state.menuState,
          `FAILED TO DELETE SERVER: ${error instanceof Error ? error.message : String(error)}`,
        ),
        false,
      );
    }
  }

  private async deleteWorld(): Promise<void> {
    if (!this.state.menuState.selectedWorldName) {
      this.state.menuState = setMenuStatus(
        this.state.menuState,
        "SELECT A WORLD TO DELETE",
      );
      return;
    }

    const worldName = this.state.menuState.selectedWorldName;
    this.state.menuState = setMenuBusy(
      this.state.menuState,
      true,
      `DELETING ${worldName}...`,
    );

    try {
      await this.deps.localWorldStorage.deleteWorld(worldName);
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
    if (!this.state.currentWorldName || !this.clientAdapter) {
      return;
    }

    try {
      await this.getClientAdapter().eventBus.send({
        type: "saveWorld",
        payload: {},
      });
    } catch (error) {
      this.state.lastServerMessage = `SAVE FAILED: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private updateGame(
    input: ReturnType<NativeBridge["pollInput"]>,
    deltaSeconds: number,
  ): void {
    const adapter = this.getClientAdapter();
    const worldRuntime = this.getWorldRuntime();

    if (isGameplaySuppressed(this.state)) {
      return;
    }

    if (input.hotbarSelection !== null) {
      adapter.eventBus.send({
        type: "selectInventorySlot",
        payload: {
          slot: input.hotbarSelection,
        },
      });
    }

    void worldRuntime.requestChunksAroundPosition(
      this.deps.player.state.position,
      this.state.clientSettings.renderDistance,
    );
    this.deps.player.update(
      input,
      deltaSeconds,
      worldRuntime.world,
    );
    const localPlayer = worldRuntime.createLocalPlayerSnapshot(
      this.deps.player.state,
      this.deps.player.gamemode,
      this.deps.player.flying,
    );
    if (localPlayer) {
      worldRuntime.applyPlayer(localPlayer);
      adapter.eventBus.send({
        type: "updatePlayerState",
        payload: {
          state: {
            position: [...this.deps.player.state.position],
            yaw: this.deps.player.state.yaw,
            pitch: this.deps.player.state.pitch,
          },
          flying: this.deps.player.flying,
        },
      });
    }

    const hit = raycastVoxel(
      worldRuntime.world,
      this.deps.player.getEyePositionVec3(),
      this.deps.player.getForwardVector(),
      8,
    );

    if (hit && input.breakBlock && !this.state.previousPrimaryDown) {
      adapter.eventBus.send({
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
      const selectedSlot = getSelectedInventorySlot(
        worldRuntime.inventory,
      );
      const placedBlockId = getPlacedBlockIdForItem(selectedSlot.itemId);
      if (selectedSlot.count <= 0 || placedBlockId === null) {
        this.state.lastServerMessage = `OUT OF ${getItemDisplayName(selectedSlot.itemId).toUpperCase()}`;
        return;
      }

      adapter.eventBus.send({
        type: "mutateBlock",
        payload: {
          x: hit.place.x,
          y: hit.place.y,
          z: hit.place.z,
          blockId: placedBlockId,
        },
      });
    }
  }

  private handlePlayOverlayInput(
    input: ReturnType<NativeBridge["pollInput"]>,
  ): void {
    if (input.exitPressed) {
      this.handlePlayEscape();
      return;
    }

    if (
      this.state.pauseScreen === "settings" ||
      this.state.pauseScreen === "menu"
    ) {
      return;
    }

    if (this.state.inventoryOpen) {
      if (input.inventoryToggle) {
        this.setInventoryOpen(false);
      }
      return;
    }

    if (this.state.chatOpen) {
      if (input.backspacePressed && this.state.chatDraft.length > 0) {
        this.state.chatDraft = this.state.chatDraft.slice(0, -1);
      }

      const typedText = resolvePlayChatTypedText(input);
      if (typedText.length > 0) {
        this.state.chatDraft += typedText;
      }

      if (input.enterPressed) {
        this.submitChatDraft();
      }
      return;
    }

    if (input.inventoryToggle) {
      this.setInventoryOpen(true);
      return;
    }

    const chatDraft = resolvePlayChatOpenDraft(input);
    if (chatDraft !== null) {
      this.state.chatOpen = true;
      this.state.chatDraft = chatDraft;
    }
  }

  private async handlePlayHudAction(action: string): Promise<void> {
    if (this.handleSharedSettingsAction(action)) {
      return;
    }

    if (action === "pause-back-to-game") {
      this.setPauseScreen("closed");
      return;
    }

    if (action === "pause-open-settings") {
      this.setPauseScreen("settings");
      return;
    }

    if (action === "pause-exit-to-menu") {
      await this.exitToMainMenu("Returned to title screen");
      return;
    }

    if (action === "back-to-pause") {
      this.setPauseScreen("menu");
      return;
    }

    if (!action.startsWith("inventory-slot:")) {
      return;
    }

    const [, section, slotText] = action.split(":");
    if ((section !== "hotbar" && section !== "main") || !slotText) {
      return;
    }

    const slot = Number(slotText);
    if (!Number.isInteger(slot)) {
      return;
    }

    this.getClientAdapter().eventBus.send({
      type: "interactInventorySlot",
      payload: {
        section,
        slot,
      },
    });
  }

  private setInventoryOpen(open: boolean): void {
    this.state.inventoryOpen = open;
    this.syncCursorMode();
  }

  private setPauseScreen(pauseScreen: PauseScreen): void {
    this.state.pauseScreen = pauseScreen;
    this.syncCursorMode();
  }

  private handlePlayEscape(): void {
    const action = resolvePlayEscapeAction({
      chatOpen: this.state.chatOpen,
      inventoryOpen: this.state.inventoryOpen,
      pauseScreen: this.state.pauseScreen,
    });

    if (action === "close-inventory") {
      this.setInventoryOpen(false);
      return;
    }

    if (action === "close-chat") {
      this.state.chatOpen = false;
      this.state.chatDraft = "";
      return;
    }

    if (action === "back-to-pause-menu") {
      this.setPauseScreen("menu");
      return;
    }

    if (action === "resume-game") {
      this.setPauseScreen("closed");
      return;
    }

    this.setPauseScreen("menu");
  }

  private async exitToMainMenu(statusText: string): Promise<void> {
    if (this.state.currentWorldName) {
      this.logInfo(`leaving "${this.state.currentWorldName}" and returning to menu`);
    }
    await this.saveCurrentWorld();
    this.state.appMode = "menu";
    this.state.loadingState = null;
    this.state.currentWorldName = null;
    this.state.currentWorldSeed = null;
    this.state.lastServerMessage = statusText;
    this.state.chatOpen = false;
    this.state.chatDraft = "";
    this.state.inventoryOpen = false;
    this.state.pauseScreen = "closed";
    this.getWorldRuntime().reset();
    this.disconnectClient();
    this.state.menuState = {
      ...this.state.menuState,
      activeScreen: "play",
      focusedField: null,
      busy: false,
      statusText,
    };
    this.syncCursorMode();
  }

  private syncCursorMode(): void {
    this.deps.nativeBridge.setCursorDisabled(
      shouldLockCursor(this.state.appMode, {
        inventoryOpen: this.state.inventoryOpen,
        pauseScreen: this.state.pauseScreen,
      }),
    );
  }

  private submitChatDraft(): void {
    const text = this.state.chatDraft.trim();
    this.state.chatOpen = false;
    this.state.chatDraft = "";
    if (!text) {
      return;
    }

    this.getClientAdapter().eventBus.send({
      type: "submitChat",
      payload: { text },
    });
  }

  private applyClientSettings(settings: ClientSettings): void {
    this.deps.player.applyClientSettings(settings);
  }

  private logInfo(message: string): void {
    appLogger.info(message);
  }

  private areClientSettingsEqual(
    left: ClientSettings,
    right: ClientSettings,
  ): boolean {
    return (
      left.fovDegrees === right.fovDegrees &&
      left.mouseSensitivity === right.mouseSensitivity &&
      left.renderDistance === right.renderDistance &&
      left.showDebugOverlay === right.showDebugOverlay &&
      left.showCrosshair === right.showCrosshair
    );
  }

  private updateClientSettings(
    partial: Partial<ClientSettings> | ClientSettings,
  ): void {
    const nextSettings = normalizeClientSettings({
      ...this.state.clientSettings,
      ...partial,
    });

    if (this.areClientSettingsEqual(nextSettings, this.state.clientSettings)) {
      return;
    }

    this.state.clientSettings = nextSettings;
    this.applyClientSettings(nextSettings);
    this.scheduleSettingsSave();
  }

  private scheduleSettingsSave(): void {
    if (this.settingsSaveTimer !== null) {
      clearTimeout(this.settingsSaveTimer);
    }

    const snapshot = cloneClientSettings(this.state.clientSettings);
    this.settingsSaveTimer = setTimeout(() => {
      this.settingsSaveTimer = null;
      this.settingsSavePromise = this.persistClientSettings(snapshot).finally(
        () => {
          this.settingsSavePromise = null;
        },
      );
    }, 120);
  }

  private async flushSettingsSave(): Promise<void> {
    if (this.settingsSaveTimer !== null) {
      clearTimeout(this.settingsSaveTimer);
      this.settingsSaveTimer = null;
      this.settingsSavePromise = this.persistClientSettings(
        this.state.clientSettings,
      );
    }

    await this.settingsSavePromise;
    this.settingsSavePromise = null;
  }

  private async persistClientSettings(settings: ClientSettings): Promise<void> {
    try {
      await this.deps.clientSettingsStorage.saveSettings(settings);
    } catch (error) {
      this.state.menuState = setMenuStatus(
        this.state.menuState,
        `FAILED TO SAVE SETTINGS: ${error instanceof Error ? error.message : String(error)}`,
      );
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
    const worldRuntime = this.clientWorldRuntime;
    this.deps.nativeBridge.beginFrame();
    this.deps.renderer.render(
      worldRuntime?.world ?? new VoxelWorld(),
      this.deps.player,
      worldRuntime ? [...worldRuntime.players.values()] : [],
      worldRuntime?.clientPlayerEntityId ?? null,
      worldRuntime?.inventory ?? createDefaultInventory(),
      this.getFirstPersonSwingProgress(),
      this.state.clientSettings.renderDistance,
      framebufferWidth,
      framebufferHeight,
      focusedBlock,
      worldRuntime ? [...worldRuntime.droppedItems.values()] : [],
      overlayText,
      uiComponents,
      windowWidth,
      windowHeight,
    );
    this.deps.nativeBridge.endFrame();
  }

  private getFirstPersonSwingProgress(): number {
    if (this.state.firstPersonSwingRemaining <= 0) {
      return 0;
    }

    return 1 - this.state.firstPersonSwingRemaining / FIRST_PERSON_SWING_DURATION;
  }
}

export const createDefaultGameApp = (options: {
  playerName: PlayerName;
  clientSettings: ClientSettings;
  clientSettingsStorage: JsonClientSettingsStorage;
  savedServerStorage: JsonSavedServerStorage;
  localWorldStorage: LocalWorldStorage;
}): GameApp => {
  const menuSeed = (Date.now() ^ 0x5f3759df) >>> 0;
  const nativeBridge = new NativeBridge();
  nativeBridge.initWindow({
    width: 1440,
    height: 900,
    title: `Minecraft Clone - ${options.playerName}`,
  });
  nativeBridge.setCursorDisabled(false);

  const player = new PlayerController();
  const renderer = new VoxelRenderer(nativeBridge);

  return new GameApp({
    nativeBridge,
    player,
    renderer,
    menuSeed,
    playerName: options.playerName,
    clientSettings: options.clientSettings,
    clientSettingsStorage: options.clientSettingsStorage,
    savedServerStorage: options.savedServerStorage,
    localWorldStorage: options.localWorldStorage,
  });
};
