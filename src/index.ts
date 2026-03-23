import { resolvePlayerIdentity } from "./client/player-profile.ts";
import { createDefaultGameApp } from "./game-app.ts";

const identity = await resolvePlayerIdentity(Bun.argv.slice(2));
const app = createDefaultGameApp({
  playerName: identity.effectivePlayerName,
});
await app.run();
