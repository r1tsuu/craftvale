import type { ServerEventMap } from '../shared/messages.ts'
import type { ChatEntry, EntityId } from '../types.ts'
import type { AuthoritativeWorld } from './authoritative-world.ts'
import type { IServerAdapter } from './server-adapter.ts'
import type { WorldTickResult } from './world-tick.ts'

import {
  WorldSessionController,
  type WorldSessionHost,
  type WorldSessionPeer,
} from './world-session-controller.ts'

interface RuntimeSessionEntry {
  controller: WorldSessionController
  unregisterJoin?: () => void
}

export interface ServerRuntimeOptions {
  logInfo?: (message: string) => void
  tickIntervalMs?: number
  maxCatchUpTicks?: number
  autoSaveIntervalTicks?: number
  autoStart?: boolean
  now?: () => number
}

export interface ServerTickStats {
  tickCount: number
  accumulatorMs: number
  tickIntervalMs: number
  maxCatchUpTicks: number
  lastTickDurationMs: number
  smoothedTps: number | null
  droppedCatchUpTicks: number
}

export class ServerRuntime {
  private static readonly DEFAULT_AUTO_SAVE_INTERVAL_TICKS = 200

  private readonly sessions = new Set<RuntimeSessionEntry>()
  private readonly now: () => number
  private readonly tickIntervalMs: number
  private readonly maxCatchUpTicks: number
  private readonly autoSaveIntervalTicks: number
  private accumulatorMs = 0
  private lastPumpAtMs: number
  private timer: ReturnType<typeof setInterval> | null = null
  private processingTicks = false
  private nextIntentSequence = 1
  private tickCount = 0
  private lastTickDurationMs = 0
  private smoothedTps: number | null = null
  private droppedCatchUpTicks = 0
  private nextAutoSaveTick: number

  public constructor(
    private readonly adapter: Pick<IServerAdapter, 'eventBus' | 'close'> | null,
    public readonly world: AuthoritativeWorld,
    private readonly options: ServerRuntimeOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now())
    this.tickIntervalMs = options.tickIntervalMs ?? 50
    this.maxCatchUpTicks = options.maxCatchUpTicks ?? 5
    this.lastPumpAtMs = this.now()
    this.autoSaveIntervalTicks =
      options.autoSaveIntervalTicks ?? ServerRuntime.DEFAULT_AUTO_SAVE_INTERVAL_TICKS
    this.nextAutoSaveTick = this.autoSaveIntervalTicks

    if (adapter) {
      this.createLocalSession(adapter)
    }

    if (options.autoStart !== false) {
      this.start()
    }
  }

  public registerSession(controller: WorldSessionController): void {
    this.sessions.add({ controller })
  }

  public unregisterSession(controller: WorldSessionController): void {
    for (const entry of this.sessions) {
      if (entry.controller !== controller) {
        continue
      }

      entry.unregisterJoin?.()
      this.sessions.delete(entry)
      return
    }
  }

  public allocateIntentSequence(): number {
    const sequence = this.nextIntentSequence
    this.nextIntentSequence += 1
    return sequence
  }

  public start(): void {
    if (this.timer) {
      return
    }

    this.lastPumpAtMs = this.now()
    this.timer = setInterval(() => {
      void this.processPendingTicks()
    }, this.tickIntervalMs)
    this.timer.unref?.()
  }

  public stop(): void {
    if (!this.timer) {
      return
    }

    clearInterval(this.timer)
    this.timer = null
  }

  public async processPendingTicks(nowMs = this.now()): Promise<number> {
    if (this.processingTicks) {
      return 0
    }

    this.processingTicks = true

    try {
      const elapsedMs = Math.max(0, nowMs - this.lastPumpAtMs)
      this.lastPumpAtMs = nowMs
      this.accumulatorMs += elapsedMs

      let ticksRun = 0
      while (this.accumulatorMs >= this.tickIntervalMs && ticksRun < this.maxCatchUpTicks) {
        this.accumulatorMs -= this.tickIntervalMs
        await this.runTick()
        ticksRun += 1
      }

      if (this.accumulatorMs >= this.tickIntervalMs) {
        const dropped = Math.floor(this.accumulatorMs / this.tickIntervalMs)
        this.droppedCatchUpTicks += dropped
        this.accumulatorMs = Math.min(this.accumulatorMs, this.tickIntervalMs - 1)
        this.options.logInfo?.(
          `server tick backlog exceeded catch-up cap in world "${this.world.summary.name}" (${dropped} tick${dropped === 1 ? '' : 's'} dropped)`,
        )
      }

      await this.maybeAutoSave()

      return ticksRun
    } finally {
      this.processingTicks = false
    }
  }

  public getTickStats(): ServerTickStats {
    return {
      tickCount: this.tickCount,
      accumulatorMs: this.accumulatorMs,
      tickIntervalMs: this.tickIntervalMs,
      maxCatchUpTicks: this.maxCatchUpTicks,
      lastTickDurationMs: this.lastTickDurationMs,
      smoothedTps: this.smoothedTps,
      droppedCatchUpTicks: this.droppedCatchUpTicks,
    }
  }

  public async shutdown(): Promise<void> {
    this.options.logInfo?.(`shutting down world "${this.world.summary.name}"`)
    this.stop()
    for (const entry of [...this.sessions]) {
      await entry.controller.disconnect()
      entry.unregisterJoin?.()
      entry.controller.dispose()
      this.sessions.delete(entry)
    }
    await this.world.save()
    this.adapter?.close()
  }

  public sendToPlayer<K extends keyof ServerEventMap>(
    playerEntityId: EntityId,
    message: {
      type: K
      payload: ServerEventMap[K]
    },
  ): void {
    for (const entry of this.sessions) {
      if (entry.controller.controlsPlayer(playerEntityId)) {
        entry.controller.sendEvent(message)
      }
    }
  }

  public broadcast<K extends keyof ServerEventMap>(
    message: {
      type: K
      payload: ServerEventMap[K]
    },
    options: {
      exclude?: WorldSessionPeer
    } = {},
  ): void {
    for (const entry of this.sessions) {
      if (options.exclude && entry.controller === options.exclude) {
        continue
      }

      entry.controller.sendEvent(message)
    }
  }

  private createLocalSession(adapter: Pick<IServerAdapter, 'eventBus' | 'close'>): void {
    const controllerRef: { current: WorldSessionController | null } = { current: null }
    const host: WorldSessionHost = {
      contextLabel: 'world',
      getWorld: () => this.world,
      allocateIntentSequence: () => this.allocateIntentSequence(),
      sendToPlayer: (playerEntityId, message) => {
        this.sendToPlayer(playerEntityId, message)
      },
      broadcast: (message, options) => {
        this.broadcast(message, options)
      },
      afterJoin: (player) => {
        const activeController = controllerRef.current
        if (!activeController) {
          return
        }
        this.broadcast(
          {
            type: 'playerJoined',
            payload: { player },
          },
          { exclude: activeController },
        )
      },
      afterLeave: (player) => {
        const activeController = controllerRef.current
        if (!activeController) {
          return
        }
        this.broadcast(
          {
            type: 'playerLeft',
            payload: {
              playerEntityId: player.entityId,
              playerName: player.name,
            },
          },
          { exclude: activeController },
        )
      },
    }

    const controller = new WorldSessionController(host, adapter)
    controllerRef.current = controller
    const unregisterJoin = adapter.eventBus.on('joinWorld', async ({ playerName }) => {
      this.options.logInfo?.(
        `join requested for "${playerName}" in world "${this.world.summary.name}"`,
      )
      const payload = await controller.join(playerName, {
        emitLoadingProgress: true,
      })
      this.options.logInfo?.(`player joined local world "${payload.world.name}": ${playerName}`)
      return payload
    })

    this.sessions.add({
      controller,
      unregisterJoin,
    })
  }

  private async runTick(): Promise<void> {
    const intents = [...this.sessions]
      .flatMap((entry) => entry.controller.drainQueuedIntents())
      .sort((left, right) => left.sequence - right.sequence)

    const startedAt = this.now()
    const result = await this.world.runTick(intents, this.tickIntervalMs / 1000)
    this.lastTickDurationMs = Math.max(0, this.now() - startedAt)
    const effectiveTps =
      1000 / Math.max(this.tickIntervalMs, this.lastTickDurationMs || this.tickIntervalMs)
    this.smoothedTps =
      this.smoothedTps === null ? effectiveTps : this.smoothedTps * 0.9 + effectiveTps * 0.1
    this.tickCount += 1

    if (this.lastTickDurationMs > this.tickIntervalMs) {
      this.options.logInfo?.(
        `server tick overran in world "${this.world.summary.name}" (${this.lastTickDurationMs.toFixed(1)} ms, ${effectiveTps.toFixed(1)} TPS)`,
      )
    }

    this.emitTickResult(result)
  }

  private async maybeAutoSave(): Promise<void> {
    if (this.tickCount < this.nextAutoSaveTick) {
      return
    }

    this.nextAutoSaveTick = this.tickCount + this.autoSaveIntervalTicks

    try {
      const result = await this.world.save()
      this.broadcast({
        type: 'saveStatus',
        payload: {
          worldName: result.world.name,
          savedChunks: result.savedChunks,
          success: true,
          kind: 'auto',
        },
      })
      this.emitSystemChatMessage(`AUTO SAVED ${result.world.name} (${result.savedChunks} CHUNKS)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.broadcast({
        type: 'saveStatus',
        payload: {
          worldName: this.world.summary.name,
          savedChunks: 0,
          success: false,
          kind: 'auto',
          error: message,
        },
      })
      this.emitSystemChatMessage(`AUTO SAVE FAILED: ${message}`)
    }
  }

  private emitSystemChatMessage(text: string): void {
    const entry: ChatEntry = {
      kind: 'system',
      text,
      receivedAt: this.now(),
    }
    this.broadcast({
      type: 'chatMessage',
      payload: { entry },
    })
  }

  private emitTickResult(result: WorldTickResult): void {
    if (result.worldTime) {
      this.broadcast({
        type: 'worldTimeUpdated',
        payload: { worldTime: result.worldTime },
      })
    }

    if (this.smoothedTps !== null) {
      this.broadcast({
        type: 'serverStats',
        payload: { tps: this.smoothedTps },
      })
    }

    for (const chunk of result.changedChunks) {
      this.broadcast({
        type: 'chunkChanged',
        payload: { chunk },
      })
    }

    for (const inventoryUpdate of result.inventoryUpdates) {
      this.sendToPlayer(inventoryUpdate.playerEntityId, {
        type: 'inventoryUpdated',
        payload: inventoryUpdate,
      })
    }

    for (const containerUpdate of result.containerUpdates) {
      this.sendToPlayer(containerUpdate.playerEntityId, {
        type: 'containerUpdated',
        payload: containerUpdate,
      })
    }

    for (const player of result.playerUpdates) {
      this.broadcast({
        type: 'playerUpdated',
        payload: { player },
      })
    }

    for (const pig of result.pigUpdates) {
      this.broadcast({
        type: 'pigUpdated',
        payload: { pig },
      })
    }

    for (const chatMessage of result.chatMessages) {
      if (chatMessage.targetPlayerEntityId) {
        this.sendToPlayer(chatMessage.targetPlayerEntityId, {
          type: 'chatMessage',
          payload: { entry: chatMessage.entry },
        })
        continue
      }

      this.broadcast({
        type: 'chatMessage',
        payload: { entry: chatMessage.entry },
      })
    }

    for (const item of result.spawnedDroppedItems) {
      this.broadcast({
        type: 'droppedItemSpawned',
        payload: { item },
      })
    }

    for (const item of result.updatedDroppedItems) {
      this.broadcast({
        type: 'droppedItemUpdated',
        payload: { item },
      })
    }

    for (const entityId of result.removedDroppedItemEntityIds) {
      this.broadcast({
        type: 'droppedItemRemoved',
        payload: { entityId },
      })
    }
  }
}
