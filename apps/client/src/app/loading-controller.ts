import type { LoadingProgressPayload } from '@craftvale/core/shared'

import { STARTUP_CHUNK_RADIUS } from '@craftvale/core/shared'

import type { TextDrawCommand } from '../render/text.ts'
import type { UiResolvedComponent } from '../ui/components.ts'

import { evaluateUi } from '../ui/components.ts'
import { buildLoadingScreen } from '../ui/loading.ts'

export interface WorldLoadingState {
  token: number
  entryMode: 'local' | 'remote'
  targetName: string
  transportLabel: string
  statusText: string
  progressPercent: number | null
}

export interface LoadingTickResult {
  focusedBlock: null
  overlayText: TextDrawCommand[]
  uiComponents: UiResolvedComponent[]
}

export interface LoadingControllerDeps {
  menuSeed: number
}

export class LoadingController {
  private loadingState: WorldLoadingState | null = null
  private nextLoadingToken = 0

  public constructor(private readonly deps: LoadingControllerDeps) {}

  public getLoadingState(): WorldLoadingState | null {
    return this.loadingState
  }

  public tick(windowWidth: number, windowHeight: number): LoadingTickResult {
    const loadingState = this.loadingState
    const uiComponents = loadingState
      ? evaluateUi(
          buildLoadingScreen(
            windowWidth,
            windowHeight,
            {
              targetName: loadingState.targetName,
              transportLabel: loadingState.transportLabel,
              statusText: loadingState.statusText,
              progressPercent: loadingState.progressPercent,
            },
            this.deps.menuSeed,
          ),
          {
            x: 0,
            y: 0,
            primaryDown: false,
            primaryPressed: false,
          },
        ).components
      : []

    return { focusedBlock: null, overlayText: [], uiComponents }
  }

  public beginLoading(loadingState: Omit<WorldLoadingState, 'token'>): number {
    const token = ++this.nextLoadingToken
    this.loadingState = { token, ...loadingState }
    return token
  }

  public isLoadingTokenActive(token: number): boolean {
    return this.loadingState?.token === token
  }

  public updateLoadingState(
    token: number,
    partial: Partial<Omit<WorldLoadingState, 'token'>>,
  ): void {
    if (!this.isLoadingTokenActive(token) || !this.loadingState) {
      return
    }

    this.loadingState = { ...this.loadingState, ...partial }
  }

  public applyLoadingProgress(progress: LoadingProgressPayload): void {
    if (!this.loadingState || this.loadingState.entryMode !== 'local') {
      return
    }

    this.loadingState = {
      ...this.loadingState,
      targetName: progress.worldName,
      statusText: progress.statusText,
      progressPercent:
        progress.totalUnits > 0 ? (progress.completedUnits / progress.totalUnits) * 100 : null,
    }
  }

  public setStatusText(text: string): void {
    if (!this.loadingState) {
      return
    }

    this.loadingState = { ...this.loadingState, statusText: text }
  }

  public getStartupChunkRadius(renderDistance: number): number {
    return Math.max(0, Math.min(STARTUP_CHUNK_RADIUS, renderDistance))
  }

  public failLoading(token: number): void {
    if (!this.isLoadingTokenActive(token)) {
      return
    }

    this.loadingState = null
  }

  public reset(): void {
    this.loadingState = null
  }
}
