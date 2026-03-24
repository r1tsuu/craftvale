import { JsonClientSettingsStorage } from "./client/client-settings.ts";
import { LocalWorldStorage } from "./client/local-world-storage.ts";
import { resolvePlayerIdentity } from "./client/player-profile.ts";
import { JsonSavedServerStorage } from "./client/saved-servers.ts";
import { createDefaultGameApp } from "./game-app.ts";

const identity = await resolvePlayerIdentity(Bun.argv.slice(2));
const clientSettingsStorage = new JsonClientSettingsStorage();
const savedServerStorage = new JsonSavedServerStorage();
const localWorldStorage = new LocalWorldStorage();
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
