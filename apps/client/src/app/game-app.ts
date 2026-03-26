import type { JoinedWorldPayload, PlayerName } from '@craftvale/core/shared'

import {
  createEmptyInventory,
  createLogger,
  VoxelWorld,
} from '@craftvale/core/shared'

import type { TextDrawCommand } from '../render/text.ts'
import type { ClientSettings } from '../types.ts'
import type { UiResolvedComponent } from '../ui/components.ts'
import type { JsonClientSettingsStorage } from './client-settings.ts'
import type { LocalWorldStorage } from './local-world-storage.ts'
import type { JsonSavedServerStorage } from './saved-servers.ts'

import {
  applyFixedStepInputEdges,
  createPendingFixedStepInputEdges,
  type PendingFixedStepInputEdges,
  queueFixedStepInputEdges,
} from '../game/fixed-step-input.ts'
import { shouldLockCursor } from '../game/play-overlay.ts'
import { PlayerController } from '../game/player.ts'
import { NativeBridge } from '../platform/native.ts'
import { VoxelRenderer } from '../render/renderer.ts'
import type { Vec3 } from '@craftvale/core/shared'
import {
  cloneClientSettings,
  createDefaultClientSettings,
  type JsonClientSettingsStorage as _JsonClientSettingsStorage,
  normalizeClientSettings,
} from './client-settings.ts'
import { type IClientAdapter } from './client-adapter.ts'
import { LoadingController } from './loading-controller.ts'
import { MenuController } from './menu-controller.ts'
import { PlayController } from './play-controller.ts'
import { setMenuBusy, setMenuStatus } from './menu-state.ts'
import { WebSocketClientAdapter } from './websocket-client-adapter.ts'
import { getBaseWindowTitle, getSessionWindowTitle } from './window-title.ts'
import { WorkerClientAdapter } from './worker-client-adapter.ts'
import { ClientWorldRuntime } from './world-runtime.ts'

export type AppMode = 'menu' | 'loading' | 'playing'

export interface GameAppDependencies {
  nativeBridge: NativeBridge
  player: PlayerController
  renderer: VoxelRenderer
  menuSeed: number
  playerName: PlayerName
  clientSettings: ClientSettings
  clientSettingsStorage: JsonClientSettingsStorage
  savedServerStorage: JsonSavedServerStorage
  localWorldStorage: LocalWorldStorage
}

const appLogger = createLogger('app', 'cyan')

export class GameApp {
  private readonly connectionUnsubscribers: Array<() => void> = []
  private initialized = false
  private shutdownStarted = false
  private settingsSaveTimer: ReturnType<typeof setTimeout> | null = null
  private settingsSavePromise: Promise<void> | null = null
  private clientAdapter: IClientAdapter | null = null
  private clientWorldRuntime: ClientWorldRuntime | null = null
  private connectionMode: 'local' | 'remote' | null = null
  private connectedServerAddress: string | null = null

  private appMode: AppMode = 'menu'
  private previousTime = 0
  private accumulator = 0
  private smoothedFps = 60
  private serverTps: number | null = null
  private pendingFixedStepInputEdges: PendingFixedStepInputEdges =
    createPendingFixedStepInputEdges()
  private currentWorldName: string | null = null
  private currentWorldSeed: number | null = null
  private lastServerMessage = ''
  private clientSettings: ClientSettings

  private readonly menuController: MenuController
  private readonly loadingController: LoadingController
  private readonly playController: PlayController

  public constructor(private readonly deps: GameAppDependencies) {
    this.clientSettings = cloneClientSettings(
      normalizeClientSettings(deps.clientSettings ?? createDefaultClientSettings()),
    )
    this.applyClientSettings(this.clientSettings)

    this.menuController = new MenuController({
      nativeBridge: deps.nativeBridge,
      menuSeed: deps.menuSeed,
      playerName: deps.playerName,
      localWorldStorage: deps.localWorldStorage,
      savedServerStorage: deps.savedServerStorage,
      getClientSettings: () => this.clientSettings,
      updateClientSettings: (partial) => this.updateClientSettings(partial),
      onJoinWorld: (worldName) => { void this.joinWorld(worldName) },
      onJoinServer: (serverId) => { void this.joinServer(serverId) },
      onDisconnect: () => this.disconnectClient(),
      syncCursorMode: () => this.syncCursorMode(),
    })

    this.loadingController = new LoadingController({
      menuSeed: deps.menuSeed,
    })

    this.playController = new PlayController({
      nativeBridge: deps.nativeBridge,
      player: deps.player,
      menuSeed: deps.menuSeed,
      getClientAdapter: () => this.getClientAdapter(),
      getWorldRuntime: () => this.getWorldRuntime(),
      getClientSettings: () => this.clientSettings,
      updateClientSettings: (partial) => this.updateClientSettings(partial),
      exitToMenu: (statusText) => this.exitToMainMenu(statusText),
      syncCursorMode: () => this.syncCursorMode(),
    })
  }

  public async run(): Promise<void> {
    await this.initialize()

    try {
      while (!this.deps.nativeBridge.shouldClose()) {
        await this.tick()
      }
    } finally {
      await this.shutdown()
    }
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.initialized = true
    appLogger.info(`starting desktop app as "${this.deps.playerName}"`)
    this.previousTime = this.deps.nativeBridge.getTime()
    await this.menuController.syncSavedServers()
  }

  public async shutdown(): Promise<void> {
    if (this.shutdownStarted) {
      return
    }

    this.shutdownStarted = true
    appLogger.info('shutting down desktop app')
    await this.flushSettingsSave()
    await this.saveCurrentWorld()
    this.disconnectClient()
    this.deps.nativeBridge.shutdown()
  }

  private async tick(): Promise<void> {
    const input = this.deps.nativeBridge.pollInput()
    this.pendingFixedStepInputEdges = queueFixedStepInputEdges(
      this.pendingFixedStepInputEdges,
      input,
    )
    const currentTime = this.deps.nativeBridge.getTime()
    const deltaTime = Math.min(currentTime - this.previousTime, 0.25)
    this.previousTime = currentTime
    this.accumulator += deltaTime

    if (deltaTime > 0) {
      const instantaneousFps = 1 / deltaTime
      this.smoothedFps = this.smoothedFps * 0.9 + instantaneousFps * 0.1
    }

    let focusedBlock: Vec3 | null = null
    let overlayText: TextDrawCommand[] = []
    let uiComponents: UiResolvedComponent[] = []

    if (this.appMode === 'menu') {
      const result = await this.menuController.tick(input, input.windowWidth, input.windowHeight)
      uiComponents = result.uiComponents
    } else if (this.appMode === 'loading') {
      const result = this.loadingController.tick(input.windowWidth, input.windowHeight)
      uiComponents = result.uiComponents
    } else {
      const result = await this.playController.tick({
        input,
        accumulator: this.accumulator,
        pendingInputEdges: this.pendingFixedStepInputEdges,
        deltaTime,
        smoothedFps: this.smoothedFps,
        serverTps: this.serverTps,
        connectionMode: this.connectionMode,
        currentWorldName: this.currentWorldName,
        currentWorldSeed: this.currentWorldSeed,
        lastServerMessage: this.lastServerMessage,
      })
      focusedBlock = result.focusedBlock
      overlayText = result.overlayText
      uiComponents = result.uiComponents
      this.accumulator = result.remainingAccumulator
      this.pendingFixedStepInputEdges = result.updatedPendingInputEdges
      if (result.updatedLastServerMessage !== null) {
        this.lastServerMessage = result.updatedLastServerMessage
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
    )
    await Bun.sleep(0)
  }

  private getClientAdapter(): IClientAdapter {
    if (!this.clientAdapter) {
      throw new Error('No client adapter is connected.')
    }

    return this.clientAdapter
  }

  private getWorldRuntime(): ClientWorldRuntime {
    if (!this.clientWorldRuntime) {
      throw new Error('No client world runtime is connected.')
    }

    return this.clientWorldRuntime
  }

  private disconnectClient(): void {
    if (this.clientAdapter) {
      appLogger.info(
        `disconnecting ${this.connectionMode ?? 'unknown'} session${this.currentWorldName ? ` for "${this.currentWorldName}"` : ''}`,
      )
    }
    for (const unsubscribe of this.connectionUnsubscribers.splice(0)) {
      unsubscribe()
    }

    this.clientAdapter?.close()
    this.clientAdapter = null
    this.clientWorldRuntime = null
    this.connectionMode = null
    this.connectedServerAddress = null
    this.serverTps = null
    this.syncWindowTitle()
  }

  private async connectLocalClient(worldName: string): Promise<void> {
    const world = await this.deps.localWorldStorage.getWorldRecord(worldName)
    if (!world) {
      throw new Error(`World "${worldName}" does not exist.`)
    }

    appLogger.info(`connecting local singleplayer worker for "${worldName}"`)
    this.disconnectClient()
    const adapter = new WorkerClientAdapter({
      storageRoot: this.deps.localWorldStorage.storageRoot,
      world,
    })
    this.clientAdapter = adapter
    this.clientWorldRuntime = new ClientWorldRuntime(adapter)
    this.connectionMode = 'local'
    this.registerConnectionEventHandlers()
  }

  private async connectRemoteClient(address: string): Promise<void> {
    const normalizedAddress = address.trim()
    if (
      this.connectionMode === 'remote' &&
      this.connectedServerAddress === normalizedAddress &&
      this.clientAdapter &&
      this.clientWorldRuntime
    ) {
      return
    }

    appLogger.info(`connecting to multiplayer server at ${normalizedAddress}`)
    this.disconnectClient()
    const adapter = await WebSocketClientAdapter.connect(this.toWebSocketUrl(normalizedAddress))
    this.clientAdapter = adapter
    this.clientWorldRuntime = new ClientWorldRuntime(adapter)
    this.connectionMode = 'remote'
    this.connectedServerAddress = normalizedAddress
    this.registerConnectionEventHandlers()
  }

  private toWebSocketUrl(address: string): string {
    if (address.startsWith('ws://') || address.startsWith('wss://')) {
      return `${address.replace(/\/+$/, '')}/ws`
    }

    return `ws://${address.replace(/\/+$/, '')}/ws`
  }

  private registerConnectionEventHandlers(): void {
    const adapter = this.getClientAdapter()
    const worldRuntime = this.getWorldRuntime()

    this.connectionUnsubscribers.push(
      adapter.eventBus.on('chunkDelivered', ({ chunk }) => {
        worldRuntime.applyChunk(chunk)
      }),
      adapter.eventBus.on('chunkChanged', ({ chunk }) => {
        worldRuntime.applyChunk(chunk)
      }),
      adapter.eventBus.on('inventoryUpdated', ({ playerEntityId, inventory }) => {
        if (playerEntityId !== worldRuntime.clientPlayerEntityId) {
          return
        }

        worldRuntime.applyInventory(inventory)
        if (this.lastServerMessage.startsWith('OUT OF ')) {
          this.lastServerMessage = ''
        }
      }),
      adapter.eventBus.on('droppedItemSpawned', ({ item }) => {
        worldRuntime.applyDroppedItem(item)
      }),
      adapter.eventBus.on('droppedItemUpdated', ({ item }) => {
        worldRuntime.applyDroppedItem(item)
      }),
      adapter.eventBus.on('droppedItemRemoved', ({ entityId }) => {
        worldRuntime.removeDroppedItem(entityId)
      }),
      adapter.eventBus.on('playerJoined', ({ player }) => {
        worldRuntime.applyPlayer(player)
      }),
      adapter.eventBus.on('playerUpdated', ({ player }) => {
        worldRuntime.applyPlayer(player)
        if (player.entityId === worldRuntime.clientPlayerEntityId) {
          this.deps.player.reconcileFromSnapshot(player)
        }
      }),
      adapter.eventBus.on('playerLeft', ({ playerEntityId, playerName }) => {
        worldRuntime.removePlayer(playerEntityId, playerName)
      }),
      adapter.eventBus.on('chatMessage', ({ entry }) => {
        worldRuntime.appendChatMessage(entry)
      }),
      adapter.eventBus.on('worldTimeUpdated', ({ worldTime }) => {
        worldRuntime.applyWorldTime(worldTime)
      }),
      adapter.eventBus.on('serverStats', ({ tps }) => {
        this.serverTps = Math.max(0, tps)
      }),
      adapter.eventBus.on('loadingProgress', (progress) => {
        this.loadingController.applyLoadingProgress(progress)
      }),
      adapter.eventBus.on('saveStatus', ({ worldName, savedChunks, success, kind, error }) => {
        this.lastServerMessage = success
          ? `${kind === 'auto' ? 'AUTO SAVED' : 'SAVED'} ${worldName} (${savedChunks} CHUNKS)`
          : `${kind === 'auto' ? 'AUTO SAVE FAILED' : 'SAVE FAILED'}: ${error ?? 'UNKNOWN ERROR'}`
        this.menuController.setStatus(this.lastServerMessage)
      }),
      adapter.eventBus.on('serverError', ({ message }) => {
        if (this.appMode === 'loading' && this.loadingController.getLoadingState()) {
          this.loadingController.setStatusText(`SERVER ERROR: ${message}`)
        }
        this.lastServerMessage = `SERVER ERROR: ${message}`
        this.menuController.setStatus(this.lastServerMessage)
      }),
      adapter.eventBus.on('worldDeleted', ({ name }) => {
        if (this.currentWorldName === name) {
          this.playController.reset()
          this.loadingController.reset()
          this.currentWorldName = null
          this.currentWorldSeed = null
          worldRuntime.reset()
          this.appMode = 'menu'
          this.syncCursorMode()
        }

        void this.menuController.syncMenuWorlds(`DELETED ${name}`)
      }),
    )
  }

  private async joinWorld(worldName: string): Promise<void> {
    appLogger.info(`joining local world "${worldName}"`)
    const loadingToken = this.loadingController.beginLoading({
      entryMode: 'local',
      targetName: worldName,
      transportLabel: 'LOCAL SINGLEPLAYER',
      statusText: `STARTING ${worldName.toUpperCase()}...`,
      progressPercent: null,
    })
    this.appMode = 'loading'
    this.lastServerMessage = ''
    this.accumulator = 0
    this.syncWindowTitle()
    this.syncCursorMode()

    try {
      await this.connectLocalClient(worldName)
      if (!this.loadingController.isLoadingTokenActive(loadingToken)) {
        return
      }

      this.loadingController.updateLoadingState(loadingToken, { statusText: 'JOINING WORLD...' })
      const joined = await this.getClientAdapter().eventBus.send({
        type: 'joinWorld',
        payload: { playerName: this.deps.playerName },
      })

      await this.completeWorldJoinLoading(loadingToken, joined, {
        successStatusText: `JOINED ${joined.world.name}`,
        connectedMessage: '',
      })
    } catch (error) {
      this.failLoading(
        loadingToken,
        `FAILED TO JOIN: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async joinServer(serverId: string): Promise<void> {
    const server = this.menuController.getMenuState().servers.find((entry) => entry.id === serverId)
    if (!server) {
      this.menuController.setStatus('SELECT A SERVER TO JOIN')
      return
    }

    appLogger.info(`joining multiplayer server "${server.name}" at ${server.address}`)
    const loadingToken = this.loadingController.beginLoading({
      entryMode: 'remote',
      targetName: server.name,
      transportLabel: 'MULTIPLAYER SERVER',
      statusText: `CONNECTING TO ${server.name.toUpperCase()}...`,
      progressPercent: null,
    })
    this.appMode = 'loading'
    this.lastServerMessage = ''
    this.accumulator = 0
    this.syncWindowTitle()
    this.syncCursorMode()

    try {
      await this.connectRemoteClient(server.address)
      if (!this.loadingController.isLoadingTokenActive(loadingToken)) {
        return
      }

      this.loadingController.updateLoadingState(loadingToken, { statusText: 'JOINING SERVER...' })
      const joined = await this.getClientAdapter().eventBus.send({
        type: 'joinServer',
        payload: { playerName: this.deps.playerName },
      })

      await this.completeWorldJoinLoading(loadingToken, joined, {
        successStatusText: `JOINED ${server.name}`,
        connectedMessage: `CONNECTED TO ${server.name.toUpperCase()}`,
      })
    } catch (error) {
      this.failLoading(
        loadingToken,
        `FAILED TO CONNECT: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async completeWorldJoinLoading(
    loadingToken: number,
    joined: JoinedWorldPayload,
    options: {
      successStatusText: string
      connectedMessage: string
    },
  ): Promise<void> {
    if (!this.loadingController.isLoadingTokenActive(loadingToken)) {
      return
    }

    const worldRuntime = this.getWorldRuntime()
    worldRuntime.reset()
    worldRuntime.applyJoinedWorld(joined)
    this.currentWorldName = joined.world.name
    this.currentWorldSeed = joined.world.seed
    this.playController.reset()
    this.deps.player.resetFromSnapshot(joined.clientPlayer)

    const currentLoadingState = this.loadingController.getLoadingState()
    const startupRadius = this.loadingController.getStartupChunkRadius(
      this.clientSettings.renderDistance,
    )
    const initialCoords = worldRuntime.getStartupChunkCoordsAroundPosition(
      joined.clientPlayer.state.position,
      startupRadius,
    )
    this.loadingController.updateLoadingState(loadingToken, {
      targetName: joined.world.name,
      statusText: 'WAITING FOR STARTUP CHUNKS...',
      progressPercent:
        currentLoadingState?.entryMode === 'local' ? currentLoadingState.progressPercent : null,
    })
    await worldRuntime.requestMissingChunks(initialCoords)
    await worldRuntime.waitForChunks(initialCoords)
    if (!this.loadingController.isLoadingTokenActive(loadingToken)) {
      return
    }

    this.loadingController.reset()
    this.appMode = 'playing'
    this.syncWindowTitle()
    this.syncCursorMode()
    this.accumulator = 0
    this.lastServerMessage = options.connectedMessage
    appLogger.info(
      `entered ${currentLoadingState?.entryMode === 'remote' ? 'multiplayer server' : 'local world'} "${joined.world.name}"`,
    )
    this.menuController.onJoinComplete(options.successStatusText)
  }

  private failLoading(token: number, statusText: string): void {
    if (!this.loadingController.isLoadingTokenActive(token)) {
      return
    }

    appLogger.info(statusText)
    this.disconnectClient()
    this.loadingController.reset()
    this.appMode = 'menu'
    this.currentWorldName = null
    this.currentWorldSeed = null
    this.playController.reset()
    this.lastServerMessage = statusText
    this.menuController.onJoinFailed(statusText)
    this.syncWindowTitle()
    this.syncCursorMode()
  }

  private async saveCurrentWorld(): Promise<void> {
    if (!this.currentWorldName || !this.clientAdapter) {
      return
    }

    try {
      await this.getClientAdapter().eventBus.send({
        type: 'saveWorld',
        payload: {},
      })
    } catch (error) {
      this.lastServerMessage = `SAVE FAILED: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  private async exitToMainMenu(statusText: string): Promise<void> {
    if (this.currentWorldName) {
      appLogger.info(`leaving "${this.currentWorldName}" and returning to menu`)
    }
    await this.saveCurrentWorld()
    this.appMode = 'menu'
    this.loadingController.reset()
    this.currentWorldName = null
    this.currentWorldSeed = null
    this.lastServerMessage = statusText
    this.playController.reset()
    this.getWorldRuntime().reset()
    this.disconnectClient()
    this.menuController.setStatus(statusText)
    this.syncWindowTitle()
    this.syncCursorMode()
  }

  private syncCursorMode(): void {
    const overlayState =
      this.appMode === 'playing'
        ? this.playController.getOverlayState()
        : { inventoryOpen: false, pauseScreen: 'closed' as const }
    this.deps.nativeBridge.setCursorDisabled(shouldLockCursor(this.appMode, overlayState))
  }

  private syncWindowTitle(): void {
    this.deps.nativeBridge.setWindowTitle(
      getSessionWindowTitle({
        playerName: this.deps.playerName,
        appMode: this.appMode,
        connectionMode: this.connectionMode,
        currentWorldName: this.currentWorldName,
        connectedServerAddress: this.connectedServerAddress,
      }),
    )
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
    const worldRuntime = this.clientWorldRuntime
    this.deps.nativeBridge.beginFrame()
    this.deps.renderer.render(
      worldRuntime?.world ?? new VoxelWorld(),
      this.deps.player,
      worldRuntime ? [...worldRuntime.players.values()] : [],
      worldRuntime?.clientPlayerEntityId ?? null,
      worldRuntime?.inventory ?? createEmptyInventory(),
      worldRuntime?.worldTime,
      this.playController.getSwingProgress(),
      this.clientSettings.renderDistance,
      framebufferWidth,
      framebufferHeight,
      focusedBlock,
      worldRuntime ? [...worldRuntime.droppedItems.values()] : [],
      overlayText,
      uiComponents,
      windowWidth,
      windowHeight,
    )
    this.deps.nativeBridge.endFrame()
  }

  private applyClientSettings(settings: ClientSettings): void {
    this.deps.player.applyClientSettings(settings)
  }

  private areClientSettingsEqual(left: ClientSettings, right: ClientSettings): boolean {
    return (
      left.fovDegrees === right.fovDegrees &&
      left.mouseSensitivity === right.mouseSensitivity &&
      left.renderDistance === right.renderDistance &&
      left.showDebugOverlay === right.showDebugOverlay &&
      left.showCrosshair === right.showCrosshair
    )
  }

  private updateClientSettings(partial: Partial<ClientSettings> | ClientSettings): void {
    const nextSettings = normalizeClientSettings({
      ...this.clientSettings,
      ...partial,
    })

    if (this.areClientSettingsEqual(nextSettings, this.clientSettings)) {
      return
    }

    this.clientSettings = nextSettings
    this.applyClientSettings(nextSettings)
    this.scheduleSettingsSave()
  }

  private scheduleSettingsSave(): void {
    if (this.settingsSaveTimer !== null) {
      clearTimeout(this.settingsSaveTimer)
    }

    const snapshot = cloneClientSettings(this.clientSettings)
    this.settingsSaveTimer = setTimeout(() => {
      this.settingsSaveTimer = null
      this.settingsSavePromise = this.persistClientSettings(snapshot).finally(() => {
        this.settingsSavePromise = null
      })
    }, 120)
  }

  private async flushSettingsSave(): Promise<void> {
    if (this.settingsSaveTimer !== null) {
      clearTimeout(this.settingsSaveTimer)
      this.settingsSaveTimer = null
      this.settingsSavePromise = this.persistClientSettings(this.clientSettings)
    }

    await this.settingsSavePromise
    this.settingsSavePromise = null
  }

  private async persistClientSettings(settings: ClientSettings): Promise<void> {
    try {
      await this.deps.clientSettingsStorage.saveSettings(settings)
    } catch (error) {
      this.menuController.setStatus(
        `FAILED TO SAVE SETTINGS: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export const createDefaultGameApp = (options: {
  playerName: PlayerName
  clientSettings: ClientSettings
  clientSettingsStorage: JsonClientSettingsStorage
  savedServerStorage: JsonSavedServerStorage
  localWorldStorage: LocalWorldStorage
}): GameApp => {
  const menuSeed = (Date.now() ^ 0x5f3759df) >>> 0
  const nativeBridge = new NativeBridge()
  nativeBridge.initWindow({
    width: 1440,
    height: 900,
    title: getBaseWindowTitle(options.playerName),
  })
  nativeBridge.setCursorDisabled(false)

  const player = new PlayerController()
  const renderer = new VoxelRenderer(nativeBridge)

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
  })
}
