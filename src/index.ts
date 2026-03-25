import { join } from "node:path";
import { JsonClientSettingsStorage } from "./client/client-settings.ts";
import { LocalWorldStorage } from "./client/local-world-storage.ts";
import {
  JsonPlayerProfileStorage,
  resolvePlayerIdentity,
} from "./client/player-profile.ts";
import { JsonSavedServerStorage } from "./client/saved-servers.ts";
import { createDefaultGameApp } from "./game-app.ts";
import { BinaryWorldStorage } from "./server/world-storage.ts";
import { parseDataDir } from "./utils/cli.ts";

const argv = Bun.argv.slice(2);
const dataDir = parseDataDir(argv);
const clientStorageRoot = dataDir ? join(dataDir, "client") : undefined;
const worldStorageRoot = dataDir;

const identity = await resolvePlayerIdentity(argv, {
  storage: clientStorageRoot
    ? new JsonPlayerProfileStorage(clientStorageRoot)
    : undefined,
});
const clientSettingsStorage = new JsonClientSettingsStorage(clientStorageRoot);
const savedServerStorage = new JsonSavedServerStorage(clientStorageRoot);
const localWorldStorage = worldStorageRoot
  ? new LocalWorldStorage(new BinaryWorldStorage(worldStorageRoot))
  : new LocalWorldStorage();
const { settings: clientSettings } = await clientSettingsStorage.getOrCreateSettings();

if (Bun.env.APP_DEV_PREFILL_SERVER_NAME && Bun.env.APP_DEV_PREFILL_SERVER_ADDRESS) {
  await savedServerStorage.ensureServer(
    Bun.env.APP_DEV_PREFILL_SERVER_NAME,
    Bun.env.APP_DEV_PREFILL_SERVER_ADDRESS,
  );
}

const app = createDefaultGameApp({
  playerName: identity.effectivePlayerName,
  clientSettings,
  clientSettingsStorage,
  savedServerStorage,
  localWorldStorage,
});
await app.run();
