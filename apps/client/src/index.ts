import { parseClientDir } from '@craftvale/core/shared'

import { JsonClientSettingsStorage } from './app/client-settings.ts'
import { createDefaultGameApp } from './app/game-app.ts'
import { DEFAULT_LOCAL_WORLD_STORAGE_ROOT, LocalWorldStorage } from './app/local-world-storage.ts'
import { JsonPlayerProfileStorage, resolvePlayerIdentity } from './app/player-profile.ts'
import { JsonSavedServerStorage } from './app/saved-servers.ts'

const appRoot = import.meta.dir.endsWith('/apps/client/src')
  ? import.meta.dir.slice(0, -'/src'.length)
  : import.meta.dir
const argv = Bun.argv.slice(2)
const clientStorageRoot = parseClientDir(argv, appRoot)
const localWorldStorageRoot = clientStorageRoot ?? DEFAULT_LOCAL_WORLD_STORAGE_ROOT

const identity = await resolvePlayerIdentity(argv, {
  storage: clientStorageRoot ? new JsonPlayerProfileStorage(clientStorageRoot) : undefined,
})
const clientSettingsStorage = new JsonClientSettingsStorage(clientStorageRoot)
const savedServerStorage = new JsonSavedServerStorage(clientStorageRoot)
const localWorldStorage = new LocalWorldStorage(localWorldStorageRoot)
const { settings: clientSettings } = await clientSettingsStorage.getOrCreateSettings()

const app = createDefaultGameApp({
  playerName: identity.effectivePlayerName,
  clientSettings,
  clientSettingsStorage,
  savedServerStorage,
  localWorldStorage,
})
await app.run()
