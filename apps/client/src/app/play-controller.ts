import type { Vec3, VoxelWorld } from '@craftvale/core/shared'
import type { InventorySnapshot } from '@craftvale/core/shared'

import {
  Biomes,
  BLOCK_IDS,
  getBiomeAt,
  getBlockDurability,
  getBlockKey,
  getItemDisplayName,
  getMainInventorySlotIndex,
  getPlacedBlockIdForItem,
  getSelectedInventorySlot,
  HOTBAR_SLOT_COUNT,
  raycastVoxel,
} from '@craftvale/core/shared'
import { interactInventorySlot } from '@craftvale/core/shared'
import { heapStats } from 'bun:jsc'

import type { PlayerController } from '../game/player.ts'
import type { TextDrawCommand } from '../render/text.ts'
import type { ClientSettings } from '../types.ts'
import type { InputState } from '../types.ts'
import type { UiResolvedComponent } from '../ui/components.ts'
import type { IClientAdapter } from './client-adapter.ts'
import type { ClientWorldRuntime } from './world-runtime.ts'

import {
  advanceBreakState,
  type BreakState,
  CREATIVE_BREAK_DURATION_MS,
  getBreakProgress,
} from '../game/break-state.ts'
import {
  applyFixedStepInputEdges,
  createPendingFixedStepInputEdges,
  type PendingFixedStepInputEdges,
} from '../game/fixed-step-input.ts'
import {
  isGameplaySuppressed,
  type PauseScreen,
  resolvePlayChatOpenDraft,
  resolvePlayChatTypedText,
  resolvePlayEscapeAction,
} from '../game/play-overlay.ts'
import { evaluateUi } from '../ui/components.ts'
import { buildDebugOverlayText } from '../ui/debug-overlay.ts'
import { buildPlayHud } from '../ui/hud.ts'
import { createDefaultClientSettings } from './client-settings.ts'

const FIXED_TIMESTEP = 1 / 60
const DROP_STACK_THRESHOLD_SECONDS = 0.4
const FIRST_PERSON_SWING_DURATION = CREATIVE_BREAK_DURATION_MS / 1000
const DEBUG_MEMORY_REFRESH_INTERVAL_SECONDS = 0.25

const formatMegabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)}MB`

const getDebugMemoryUsageText = (): string => {
  const stats = heapStats()
  return `${formatMegabytes(stats.heapSize)} / ${formatMegabytes(stats.heapCapacity)} (+${formatMegabytes(stats.extraMemorySize)})`
}

export interface PlayTickContext {
  input: InputState
  accumulator: number
  pendingInputEdges: PendingFixedStepInputEdges
  deltaTime: number
  smoothedFps: number
  serverTps: number | null
  connectionMode: 'local' | 'remote' | null
  currentWorldName: string | null
  currentWorldSeed: number | null
  lastServerMessage: string
}

export interface PlayTickResult {
  focusedBlock: Vec3 | null
  breakProgress: number
  overlayText: TextDrawCommand[]
  uiComponents: UiResolvedComponent[]
  remainingAccumulator: number
  updatedPendingInputEdges: PendingFixedStepInputEdges
  updatedLastServerMessage: string | null
}

export interface PlayControllerDeps {
  nativeBridge: { getTime(): number }
  player: PlayerController
  menuSeed: number
  getClientAdapter(): IClientAdapter
  getWorldRuntime(): ClientWorldRuntime
  getClientSettings(): ClientSettings
  updateClientSettings(partial: Partial<ClientSettings>): void
  exitToMenu(statusText: string): Promise<void>
  syncCursorMode(): void
}

export class PlayController {
  private chatOpen = false
  private chatDraft = ''
  private inventoryOpen = false
  private pauseScreen: PauseScreen = 'closed'
  private firstPersonSwingRemaining = 0
  private debugMemoryUsageText = getDebugMemoryUsageText()
  private nextDebugMemoryRefreshTime = 0
  private predictedInventory: InventorySnapshot | null = null
  private breakState: BreakState | null = null
  private creativeBreakCooldownMs = 0
  private dropHeldSeconds = 0
  private droppedStackThisTap = false

  public constructor(private readonly deps: PlayControllerDeps) {}

  public clearPrediction(): void {
    this.predictedInventory = null
  }

  private getDisplayInventory(): InventorySnapshot {
    return this.predictedInventory ?? this.deps.getWorldRuntime().inventory
  }

  public getOverlayState(): { inventoryOpen: boolean; pauseScreen: PauseScreen } {
    return { inventoryOpen: this.inventoryOpen, pauseScreen: this.pauseScreen }
  }

  public getSwingProgress(): number {
    if (this.firstPersonSwingRemaining <= 0) {
      return 0
    }

    return 1 - this.firstPersonSwingRemaining / FIRST_PERSON_SWING_DURATION
  }

  public reset(): void {
    this.chatOpen = false
    this.chatDraft = ''
    this.inventoryOpen = false
    this.pauseScreen = 'closed'
    this.firstPersonSwingRemaining = 0
    this.breakState = null
    this.creativeBreakCooldownMs = 0
    this.dropHeldSeconds = 0
    this.droppedStackThisTap = false
  }

  public async tick(context: PlayTickContext): Promise<PlayTickResult> {
    const {
      input,
      deltaTime,
      smoothedFps,
      serverTps,
      connectionMode,
      currentWorldName,
      currentWorldSeed,
    } = context
    let { accumulator, pendingInputEdges, lastServerMessage } = context

    this.firstPersonSwingRemaining = Math.max(0, this.firstPersonSwingRemaining - deltaTime)

    if (
      (input.breakBlockPressed || input.placeBlockPressed) &&
      !isGameplaySuppressed({
        chatOpen: this.chatOpen,
        inventoryOpen: this.inventoryOpen,
        pauseScreen: this.pauseScreen,
      })
    ) {
      this.firstPersonSwingRemaining = FIRST_PERSON_SWING_DURATION
    }

    if (
      this.firstPersonSwingRemaining <= 0 &&
      this.breakState !== null &&
      !isGameplaySuppressed({
        chatOpen: this.chatOpen,
        inventoryOpen: this.inventoryOpen,
        pauseScreen: this.pauseScreen,
      })
    ) {
      this.firstPersonSwingRemaining = FIRST_PERSON_SWING_DURATION
    }

    this.handlePlayOverlayInput(input)

    if (!this.chatOpen && !this.inventoryOpen && this.pauseScreen === 'closed') {
      this.deps.player.applyLook(input)
    }

    let updatedLastServerMessage: string | null = null
    while (accumulator >= FIXED_TIMESTEP) {
      const stepInput = applyFixedStepInputEdges(input, pendingInputEdges)
      pendingInputEdges = createPendingFixedStepInputEdges()
      const outOfStockMessage = this.updateGame(stepInput, FIXED_TIMESTEP)
      if (outOfStockMessage !== null) {
        updatedLastServerMessage = outOfStockMessage
        lastServerMessage = outOfStockMessage
      }
      accumulator -= FIXED_TIMESTEP
    }

    const worldRuntime = this.deps.getWorldRuntime()
    const focusHit = raycastVoxel(
      worldRuntime.world,
      this.deps.player.getEyePositionVec3(),
      this.deps.player.getForwardVector(),
      8,
    )
    const [x, y, z] = this.deps.player.state.position
    const yawDegrees = (this.deps.player.state.yaw * 180) / Math.PI
    const pitchDegrees = (this.deps.player.state.pitch * 180) / Math.PI
    const biomeName = this.getCurrentBiomeName(currentWorldSeed, x, z)

    const focusedBlock = focusHit?.hit ?? null

    let breakProgress = 0
    if (
      this.breakState !== null &&
      focusedBlock !== null &&
      this.breakState.x === focusedBlock.x &&
      this.breakState.y === focusedBlock.y &&
      this.breakState.z === focusedBlock.z
    ) {
      const blockId = worldRuntime.world.getBlock(focusedBlock.x, focusedBlock.y, focusedBlock.z)
      const localGamemode = worldRuntime.getClientPlayer()?.gamemode ?? this.deps.player.gamemode
      breakProgress = getBreakProgress(this.breakState, getBlockDurability(blockId))
    }

    const overlayText = this.deps.getClientSettings().showDebugOverlay
      ? this.buildOverlayText(
          worldRuntime.world,
          x,
          y,
          z,
          yawDegrees,
          pitchDegrees,
          focusedBlock,
          breakProgress,
          smoothedFps,
          serverTps,
          connectionMode,
          currentWorldName,
          lastServerMessage,
        )
      : []

    const playHud = buildPlayHud(input.windowWidth, input.windowHeight, {
      inventory: this.getDisplayInventory(),
      worldTime: worldRuntime.worldTime,
      inventoryOpen: this.inventoryOpen,
      cursorX: input.cursorX,
      cursorY: input.cursorY,
      showCrosshair: this.deps.getClientSettings().showCrosshair,
      pauseScreen: this.pauseScreen,
      pauseSettings:
        this.pauseScreen === 'settings'
          ? {
              settings: this.deps.getClientSettings(),
              statusText: lastServerMessage || 'ADJUST SETTINGS AND GO BACK TO RESUME',
              busy: false,
            }
          : undefined,
      biomeName,
      chatMessages: worldRuntime.chatMessages,
      chatNowMs: Date.now(),
      chatDraft: this.chatDraft,
      chatOpen: this.chatOpen,
      gamemode: worldRuntime.getClientPlayer()?.gamemode ?? 0,
      flying: worldRuntime.getClientPlayer()?.flying ?? false,
    })
    const evaluation = evaluateUi(playHud, {
      x: input.cursorX,
      y: input.cursorY,
      primaryDown: input.breakBlock,
      primaryPressed: input.breakBlockPressed,
    })

    for (const change of evaluation.sliderChanges) {
      this.handleSliderChange(change.action, change.value)
    }

    for (const action of evaluation.actions) {
      await this.handlePlayHudAction(action)
    }

    return {
      focusedBlock,
      breakProgress,
      overlayText,
      uiComponents: evaluation.components,
      remainingAccumulator: accumulator,
      updatedPendingInputEdges: pendingInputEdges,
      updatedLastServerMessage,
    }
  }

  private updateGame(input: InputState, deltaSeconds: number): string | null {
    const adapter = this.deps.getClientAdapter()
    const worldRuntime = this.deps.getWorldRuntime()

    if (
      isGameplaySuppressed({
        chatOpen: this.chatOpen,
        inventoryOpen: this.inventoryOpen,
        pauseScreen: this.pauseScreen,
      })
    ) {
      this.breakState = null
      this.creativeBreakCooldownMs = 0
      this.dropHeldSeconds = 0
      this.droppedStackThisTap = false
      return null
    }

    if (!input.breakBlock) {
      this.creativeBreakCooldownMs = 0
    } else if (this.creativeBreakCooldownMs > 0) {
      this.creativeBreakCooldownMs = Math.max(
        0,
        this.creativeBreakCooldownMs - deltaSeconds * 1000,
      )
    }

    if (input.hotbarSelection !== null) {
      adapter.eventBus.send({
        type: 'selectInventorySlot',
        payload: { slot: input.hotbarSelection },
      })
    } else if (input.hotbarScrollDelta !== 0) {
      const currentSlot = worldRuntime.inventory.selectedSlot
      const next =
        (((currentSlot + Math.sign(input.hotbarScrollDelta)) % HOTBAR_SLOT_COUNT) +
          HOTBAR_SLOT_COUNT) %
        HOTBAR_SLOT_COUNT
      adapter.eventBus.send({ type: 'selectInventorySlot', payload: { slot: next } })
    }

    if (input.dropItemHeld) {
      this.dropHeldSeconds += deltaSeconds
    } else {
      this.dropHeldSeconds = 0
      this.droppedStackThisTap = false
    }

    const dropSlot = worldRuntime.inventory.selectedSlot
    const dropSlotData = getSelectedInventorySlot(worldRuntime.inventory)

    if (input.dropItemPressed && dropSlotData.count > 0) {
      adapter.eventBus.send({ type: 'dropItem', payload: { slot: dropSlot, count: 1 } })
    }

    if (
      input.dropItemHeld &&
      !this.droppedStackThisTap &&
      this.dropHeldSeconds >= DROP_STACK_THRESHOLD_SECONDS &&
      dropSlotData.count > 1
    ) {
      adapter.eventBus.send({
        type: 'dropItem',
        payload: { slot: dropSlot, count: dropSlotData.count - 1 },
      })
      this.droppedStackThisTap = true
    }

    void worldRuntime.requestChunksAroundPosition(
      this.deps.player.state.position,
      this.deps.getClientSettings().renderDistance,
    )
    this.deps.player.update(input, deltaSeconds, worldRuntime.world)
    const localPlayer = worldRuntime.createLocalPlayerSnapshot(
      this.deps.player.state,
      this.deps.player.gamemode,
      this.deps.player.flying,
    )
    if (localPlayer) {
      worldRuntime.applyPlayer(localPlayer)
      adapter.eventBus.send({
        type: 'updatePlayerState',
        payload: {
          state: {
            position: [...this.deps.player.state.position],
            yaw: this.deps.player.state.yaw,
            pitch: this.deps.player.state.pitch,
          },
          flying: this.deps.player.flying,
        },
      })
    }

    const hit = raycastVoxel(
      worldRuntime.world,
      this.deps.player.getEyePositionVec3(),
      this.deps.player.getForwardVector(),
      8,
    )

    if (hit && input.breakBlock) {
      const { x, y, z } = hit.hit
      const localGamemode = worldRuntime.getClientPlayer()?.gamemode ?? this.deps.player.gamemode
      if (localGamemode === 1) {
        this.breakState = null
        if (input.breakBlockPressed || this.creativeBreakCooldownMs <= 0) {
          this.firstPersonSwingRemaining = FIRST_PERSON_SWING_DURATION
          worldRuntime.applyPredictedBreak(x, y, z, localGamemode)
          adapter.eventBus.send({
            type: 'mutateBlock',
            payload: { x, y, z, blockId: BLOCK_IDS.air },
          })
          this.creativeBreakCooldownMs = CREATIVE_BREAK_DURATION_MS
        }
      } else {
        this.breakState = advanceBreakState(this.breakState, { x, y, z }, deltaSeconds * 1000)
        const blockId = worldRuntime.world.getBlock(x, y, z)
        const progress = getBreakProgress(this.breakState!, getBlockDurability(blockId))
        if (progress >= 1) {
          worldRuntime.applyPredictedBreak(x, y, z, localGamemode)
          adapter.eventBus.send({
            type: 'mutateBlock',
            payload: { x, y, z, blockId: BLOCK_IDS.air },
          })
          this.breakState = null
        }
      }
    } else {
      this.breakState = null
    }

    if (hit && input.placeBlockPressed) {
      const selectedSlot = getSelectedInventorySlot(worldRuntime.inventory)
      const placedBlockId = getPlacedBlockIdForItem(selectedSlot.itemId)
      if (selectedSlot.count <= 0 || placedBlockId === null) {
        return `OUT OF ${getItemDisplayName(selectedSlot.itemId).toUpperCase()}`
      }

      adapter.eventBus.send({
        type: 'mutateBlock',
        payload: { x: hit.place.x, y: hit.place.y, z: hit.place.z, blockId: placedBlockId },
      })
    }

    return null
  }

  private handlePlayOverlayInput(input: InputState): void {
    if (input.exitPressed) {
      this.handlePlayEscape()
      return
    }

    if (this.pauseScreen === 'settings' || this.pauseScreen === 'menu') {
      return
    }

    if (this.inventoryOpen) {
      if (input.inventoryToggle) {
        this.setInventoryOpen(false)
      }
      return
    }

    if (this.chatOpen) {
      if (input.backspacePressed && this.chatDraft.length > 0) {
        this.chatDraft = this.chatDraft.slice(0, -1)
      }

      const typedText = resolvePlayChatTypedText(input)
      if (typedText.length > 0) {
        this.chatDraft += typedText
      }

      if (input.enterPressed) {
        this.submitChatDraft()
      }
      return
    }

    if (input.inventoryToggle) {
      this.setInventoryOpen(true)
      return
    }

    const chatDraft = resolvePlayChatOpenDraft(input)
    if (chatDraft !== null) {
      this.chatOpen = true
      this.chatDraft = chatDraft
    }
  }

  private async handlePlayHudAction(action: string): Promise<void> {
    if (this.handleSharedSettingsAction(action)) {
      return
    }

    if (action === 'pause-back-to-game') {
      this.setPauseScreen('closed')
      return
    }

    if (action === 'pause-open-settings') {
      this.setPauseScreen('settings')
      return
    }

    if (action === 'pause-exit-to-menu') {
      await this.deps.exitToMenu('Returned to title screen')
      return
    }

    if (action === 'back-to-pause') {
      this.setPauseScreen('menu')
      return
    }

    if (!action.startsWith('inventory-slot:')) {
      return
    }

    const [, section, slotText] = action.split(':')
    if ((section !== 'hotbar' && section !== 'main') || !slotText) {
      return
    }

    const slot = Number(slotText)
    if (!Number.isInteger(slot)) {
      return
    }

    const resolvedSlot = section === 'hotbar' ? slot : getMainInventorySlotIndex(slot)
    this.predictedInventory = interactInventorySlot(this.getDisplayInventory(), resolvedSlot)

    this.deps.getClientAdapter().eventBus.send({
      type: 'interactInventorySlot',
      payload: { slot: resolvedSlot },
    })
  }

  private handlePlayEscape(): void {
    const action = resolvePlayEscapeAction({
      chatOpen: this.chatOpen,
      inventoryOpen: this.inventoryOpen,
      pauseScreen: this.pauseScreen,
    })

    if (action === 'close-inventory') {
      this.setInventoryOpen(false)
      return
    }

    if (action === 'close-chat') {
      this.chatOpen = false
      this.chatDraft = ''
      return
    }

    if (action === 'back-to-pause-menu') {
      this.setPauseScreen('menu')
      return
    }

    if (action === 'resume-game') {
      this.setPauseScreen('closed')
      return
    }

    this.setPauseScreen('menu')
  }

  private setInventoryOpen(open: boolean): void {
    this.inventoryOpen = open
    this.deps.syncCursorMode()
  }

  private setPauseScreen(pauseScreen: PauseScreen): void {
    this.pauseScreen = pauseScreen
    this.deps.syncCursorMode()
  }

  private submitChatDraft(): void {
    const text = this.chatDraft.trim()
    this.chatOpen = false
    this.chatDraft = ''
    if (!text) {
      return
    }

    this.deps.getClientAdapter().eventBus.send({
      type: 'submitChat',
      payload: { text },
    })
  }

  private handleSliderChange(action: string, value: number): void {
    if (action === 'set-setting:fovDegrees') {
      this.deps.updateClientSettings({ fovDegrees: value })
      return
    }

    if (action === 'set-setting:mouseSensitivity') {
      this.deps.updateClientSettings({ mouseSensitivity: value })
      return
    }

    if (action === 'set-setting:renderDistance') {
      this.deps.updateClientSettings({ renderDistance: value })
    }
  }

  private handleSharedSettingsAction(action: string): boolean {
    const settings = this.deps.getClientSettings()

    if (action === 'toggle-setting:showDebugOverlay') {
      this.deps.updateClientSettings({ showDebugOverlay: !settings.showDebugOverlay })
      return true
    }

    if (action === 'toggle-setting:showCrosshair') {
      this.deps.updateClientSettings({ showCrosshair: !settings.showCrosshair })
      return true
    }

    if (action === 'reset-settings') {
      this.deps.updateClientSettings(createDefaultClientSettings())
      return true
    }

    return false
  }

  private buildOverlayText(
    world: VoxelWorld,
    x: number,
    y: number,
    z: number,
    yawDegrees: number,
    pitchDegrees: number,
    focusedBlock: Vec3 | null,
    breakProgress: number,
    smoothedFps: number,
    serverTps: number | null,
    connectionMode: 'local' | 'remote' | null,
    currentWorldName: string | null,
    lastServerMessage: string,
  ): TextDrawCommand[] {
    const playerBlockX = Math.floor(x)
    const playerBlockY = Math.floor(y)
    const playerBlockZ = Math.floor(z)
    const playerSkyLight = world.getSkyLight(playerBlockX, playerBlockY, playerBlockZ)
    const playerBlockLight = world.getBlockLight(playerBlockX, playerBlockY, playerBlockZ)
    const focusedBlockKey = focusedBlock
      ? getBlockKey(world.getBlock(focusedBlock.x, focusedBlock.y, focusedBlock.z))
      : null
    const tpsSourceLabel =
      connectionMode === 'local' ? 'WORKER' : connectionMode === 'remote' ? 'WS' : null
    const memoryUsageText = this.getDebouncedDebugMemoryUsageText()
    return buildDebugOverlayText({
      fps: smoothedFps,
      tps: serverTps,
      tpsSourceLabel,
      worldName: currentWorldName,
      memoryUsageText,
      loadedChunkCount: world.getLoadedChunkCount(),
      lastServerMessage,
      position: [x, y, z],
      yawDegrees,
      pitchDegrees,
      playerSkyLight,
      playerBlockLight,
      focusedBlockKey,
      focusedSkyLight: focusedBlock
        ? world.getSkyLight(focusedBlock.x, focusedBlock.y, focusedBlock.z)
        : null,
      focusedBlockLight: focusedBlock
        ? world.getBlockLight(focusedBlock.x, focusedBlock.y, focusedBlock.z)
        : null,
      breakProgress,
    })
  }

  private getDebouncedDebugMemoryUsageText(): string {
    const now = this.deps.nativeBridge.getTime()
    if (now >= this.nextDebugMemoryRefreshTime) {
      this.debugMemoryUsageText = getDebugMemoryUsageText()
      this.nextDebugMemoryRefreshTime = now + DEBUG_MEMORY_REFRESH_INTERVAL_SECONDS
    }

    return this.debugMemoryUsageText
  }

  private getCurrentBiomeName(
    currentWorldSeed: number | null,
    worldX: number,
    worldZ: number,
  ): string | null {
    if (currentWorldSeed === null) {
      return null
    }

    const biomeId = getBiomeAt(currentWorldSeed, Math.floor(worldX), Math.floor(worldZ))
    return Biomes[biomeId].name.toUpperCase()
  }
}
