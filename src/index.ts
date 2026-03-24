import { JsonClientSettingsStorage } from "./client/client-settings.ts";
import { resolvePlayerIdentity } from "./client/player-profile.ts";
import { createDefaultGameApp } from "./game-app.ts";

const identity = await resolvePlayerIdentity(Bun.argv.slice(2));
const clientSettingsStorage = new JsonClientSettingsStorage();
const { settings: clientSettings } = await clientSettingsStorage.getOrCreateSettings();
const app = createDefaultGameApp({
  playerName: identity.effectivePlayerName,
  clientSettings,
  clientSettingsStorage,
});
await app.run();
