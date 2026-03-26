import type { PlayerName } from '@craftvale/core/shared'

import type { TextDrawCommand } from '../render/text.ts'
import type { ClientSettings } from '../types.ts'
import type { InputState } from '../types.ts'
import type { UiResolvedComponent } from '../ui/components.ts'
import type { LocalWorldStorage } from './local-world-storage.ts'
import type { JsonSavedServerStorage } from './saved-servers.ts'

import { evaluateUi } from '../ui/components.ts'
import { buildMainMenu } from '../ui/menu.ts'
import { createDefaultClientSettings } from './client-settings.ts'
import {
  applyMenuAction,
  applyMenuTyping,
  createMenuState,
  type MenuState,
  parseSeedInput,
  setMenuBusy,
  setMenuServers,
  setMenuStatus,
  setMenuWorlds,
  suggestWorldName,
} from './menu-state.ts'
import { isValidSavedServerAddress, isValidSavedServerName } from './saved-servers.ts'

export interface MenuTickResult {
  focusedBlock: null
  overlayText: TextDrawCommand[]
  uiComponents: UiResolvedComponent[]
}

export interface MenuControllerDeps {
  nativeBridge: { requestClose(): void }
  menuSeed: number
  playerName: PlayerName
  localWorldStorage: LocalWorldStorage
  savedServerStorage: JsonSavedServerStorage
  getClientSettings(): ClientSettings
  updateClientSettings(partial: Partial<ClientSettings>): void
  onJoinWorld(worldName: string): void
  onJoinServer(serverId: string): void
  onDisconnect(): void
  syncCursorMode(): void
}

export class MenuController {
  private menuState: MenuState = createMenuState()

  public constructor(private readonly deps: MenuControllerDeps) {}

  public getMenuState(): MenuState {
    return this.menuState
  }

  public setStatus(text: string): void {
    this.menuState = setMenuStatus(this.menuState, text)
  }

  public onJoinComplete(successText: string): void {
    this.menuState = setMenuBusy(setMenuStatus(this.menuState, successText), false)
  }

  public onJoinFailed(statusText: string): void {
    this.menuState = setMenuBusy(setMenuStatus(this.menuState, statusText), false)
  }

  public async tick(
    input: InputState,
    windowWidth: number,
    windowHeight: number,
  ): Promise<MenuTickResult> {
    this.menuState = applyMenuTyping(this.menuState, input)
    const menu = buildMainMenu(
      windowWidth,
      windowHeight,
      {
        ...this.menuState,
        settings: this.deps.getClientSettings(),
      },
      this.deps.menuSeed,
    )
    const evaluation = evaluateUi(menu, {
      x: input.cursorX,
      y: input.cursorY,
      primaryDown: input.breakBlock,
      primaryPressed: input.breakBlockPressed,
    })

    for (const change of evaluation.sliderChanges) {
      this.handleSliderChange(change.action, change.value)
    }

    for (const action of evaluation.actions) {
      await this.handleAction(action)
    }

    if (
      input.enterPressed &&
      !this.menuState.busy &&
      this.menuState.activeScreen === 'create-world'
    ) {
      await this.createWorld()
    }

    return { focusedBlock: null, overlayText: [], uiComponents: evaluation.components }
  }

  public async syncMenuWorlds(statusText = 'SELECT OR CREATE A WORLD'): Promise<void> {
    this.menuState = setMenuBusy(this.menuState, true, 'LOADING WORLDS...')

    try {
      const worlds = await this.deps.localWorldStorage.listWorlds()
      this.menuState = setMenuWorlds(
        {
          ...this.menuState,
          busy: false,
          statusText,
        },
        worlds,
      )
    } catch (error) {
      this.menuState = setMenuBusy(
        setMenuStatus(
          this.menuState,
          `FAILED TO LOAD WORLDS: ${error instanceof Error ? error.message : String(error)}`,
        ),
        false,
      )
    }
  }

  public async syncSavedServers(statusText = 'SELECT A MODE'): Promise<void> {
    const servers = await this.deps.savedServerStorage.loadServers()
    this.menuState = setMenuServers(setMenuStatus(this.menuState, statusText), servers)
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

  private async handleAction(action: string): Promise<void> {
    this.menuState = applyMenuAction(this.menuState, action)

    if (this.handleSharedSettingsAction(action)) {
      return
    }

    if (action === 'back-to-play' && !this.menuState.busy) {
      this.deps.onDisconnect()
      await this.syncSavedServers('SELECT A MODE')
      return
    }

    if (action === 'open-worlds' && !this.menuState.busy) {
      await this.syncMenuWorlds()
      return
    }

    if (action === 'open-multiplayer' && !this.menuState.busy) {
      await this.syncSavedServers('SELECT A SERVER')
      return
    }

    if (action === 'refresh-worlds' && !this.menuState.busy) {
      await this.syncMenuWorlds()
      return
    }

    if (action === 'join-world' && !this.menuState.busy && this.menuState.selectedWorldName) {
      this.deps.onJoinWorld(this.menuState.selectedWorldName)
      return
    }

    if (action === 'join-server' && !this.menuState.busy && this.menuState.selectedServerId) {
      this.deps.onJoinServer(this.menuState.selectedServerId)
      return
    }

    if (action === 'save-server' && !this.menuState.busy) {
      await this.saveServer()
      return
    }

    if (action.startsWith('delete-server:') && !this.menuState.busy) {
      await this.deleteServer(action.slice('delete-server:'.length))
      return
    }

    if (action === 'delete-world' && !this.menuState.busy) {
      await this.deleteWorld()
      return
    }

    if (action === 'create-world' && !this.menuState.busy) {
      await this.createWorld()
      return
    }

    if (action === 'quit-game') {
      this.deps.nativeBridge.requestClose()
    }
  }

  private async createWorld(): Promise<void> {
    const worldName =
      this.menuState.createWorldName.trim() || suggestWorldName(this.menuState.worlds)

    this.menuState = setMenuBusy(this.menuState, true, 'CREATING WORLD...')

    try {
      const seed = parseSeedInput(this.menuState.createSeedText)
      const world = await this.deps.localWorldStorage.createWorld(worldName, seed)

      const worlds = [...this.menuState.worlds, world].sort((left, right) =>
        left.name.localeCompare(right.name),
      )
      this.menuState = setMenuWorlds(
        {
          ...this.menuState,
          activeScreen: 'worlds',
          busy: false,
          selectedWorldName: world.name,
          focusedField: null,
          createWorldName: '',
          createSeedText: '',
          statusText: `CREATED ${world.name}`,
        },
        worlds,
      )
    } catch (error) {
      this.menuState = setMenuBusy(
        setMenuStatus(
          this.menuState,
          `FAILED TO CREATE: ${error instanceof Error ? error.message : String(error)}`,
        ),
        false,
      )
    }
  }

  private async saveServer(): Promise<void> {
    const name = this.menuState.addServerName.trim()
    const address = this.menuState.addServerAddress.trim()

    if (!isValidSavedServerName(name)) {
      this.menuState = setMenuStatus(this.menuState, 'ENTER A SERVER NAME')
      return
    }

    if (!isValidSavedServerAddress(address)) {
      this.menuState = setMenuStatus(this.menuState, 'ENTER A SERVER ADDRESS')
      return
    }

    this.menuState = setMenuBusy(this.menuState, true, 'SAVING SERVER...')

    try {
      const servers = await this.deps.savedServerStorage.ensureServer(name, address)
      const saved = servers.find((server) => server.address === address) ?? null
      this.menuState = setMenuServers(
        {
          ...this.menuState,
          activeScreen: 'multiplayer',
          busy: false,
          selectedServerId: saved?.id ?? this.menuState.selectedServerId,
          addServerName: '',
          addServerAddress: '',
          focusedField: null,
          statusText: `SAVED ${name.toUpperCase()}`,
        },
        servers,
      )
    } catch (error) {
      this.menuState = setMenuBusy(
        setMenuStatus(
          this.menuState,
          `FAILED TO SAVE SERVER: ${error instanceof Error ? error.message : String(error)}`,
        ),
        false,
      )
    }
  }

  private async deleteServer(serverId: string): Promise<void> {
    this.menuState = setMenuBusy(this.menuState, true, 'DELETING SERVER...')

    try {
      const servers = await this.deps.savedServerStorage.deleteServer(serverId)
      this.menuState = setMenuServers(
        {
          ...this.menuState,
          busy: false,
          statusText: 'DELETED SERVER',
        },
        servers,
      )
    } catch (error) {
      this.menuState = setMenuBusy(
        setMenuStatus(
          this.menuState,
          `FAILED TO DELETE SERVER: ${error instanceof Error ? error.message : String(error)}`,
        ),
        false,
      )
    }
  }

  private async deleteWorld(): Promise<void> {
    if (!this.menuState.selectedWorldName) {
      this.menuState = setMenuStatus(this.menuState, 'SELECT A WORLD TO DELETE')
      return
    }

    const worldName = this.menuState.selectedWorldName
    this.menuState = setMenuBusy(this.menuState, true, `DELETING ${worldName}...`)

    try {
      await this.deps.localWorldStorage.deleteWorld(worldName)
      await this.syncMenuWorlds(`DELETED ${worldName}`)
    } catch (error) {
      this.menuState = setMenuBusy(
        setMenuStatus(
          this.menuState,
          `FAILED TO DELETE: ${error instanceof Error ? error.message : String(error)}`,
        ),
        false,
      )
    }
  }
}
