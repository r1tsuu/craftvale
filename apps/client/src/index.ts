import { join } from "node:path";
import { JsonClientSettingsStorage } from "./client/client-settings.ts";
import { LocalWorldStorage } from "./client/local-world-storage.ts";
import {
  JsonPlayerProfileStorage,
  resolvePlayerIdentity,
} from "./client/player-profile.ts";
import { JsonSavedServerStorage } from "./client/saved-servers.ts";
import { createDefaultGameApp } from "./game-app.ts";
import { parseClientDir } from "@voxel/core/shared";

const argv = Bun.argv.slice(2);
const clientStorageRoot = parseClientDir(argv);
const localWorldStorageRoot = clientStorageRoot ? join(clientStorageRoot, "worlds") : undefined;

const identity = await resolvePlayerIdentity(argv, {
  storage: clientStorageRoot
    ? new JsonPlayerProfileStorage(clientStorageRoot)
    : undefined,
});
const clientSettingsStorage = new JsonClientSettingsStorage(clientStorageRoot);
const savedServerStorage = new JsonSavedServerStorage(clientStorageRoot);
const localWorldStorage = localWorldStorageRoot
  ? new LocalWorldStorage(localWorldStorageRoot)
  : new LocalWorldStorage();
const { settings: clientSettings } = await clientSettingsStorage.getOrCreateSettings();

const app = createDefaultGameApp({
  playerName: identity.effectivePlayerName,
  clientSettings,
  clientSettingsStorage,
  savedServerStorage,
  localWorldStorage,
});
await app.run();
