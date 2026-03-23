import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  JsonPlayerProfileStorage,
  parsePlayerNameOverride,
  resolvePlayerIdentity,
} from "../src/client/player-profile.ts";

const OVERRIDE_PLAYER_NAME = "Debug Player";

const createStorage = async (): Promise<{
  rootDir: string;
  storage: JsonPlayerProfileStorage;
}> => {
  const rootDir = await mkdtemp(join(tmpdir(), "bun-opengl-player-profile-"));
  return {
    rootDir,
    storage: new JsonPlayerProfileStorage(rootDir),
  };
};

test("player profile storage generates and reuses a stable player name", async () => {
  const { rootDir, storage } = await createStorage();

  try {
    const first = await storage.getOrCreateProfile();
    const second = await storage.getOrCreateProfile();

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.profile.playerName).toBe(first.profile.playerName);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("dev mode defaults the generated player name to Developer", async () => {
  const { rootDir, storage } = await createStorage();
  const previousAppEnv = Bun.env.APP_ENV;

  try {
    Bun.env.APP_ENV = "development";
    const first = await storage.getOrCreateProfile();
    expect(first.profile.playerName).toBe("Developer");
  } finally {
    if (previousAppEnv === undefined) {
      delete Bun.env.APP_ENV;
    } else {
      Bun.env.APP_ENV = previousAppEnv;
    }
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("player identity resolution honors a CLI override without rewriting the stored profile", async () => {
  const { rootDir, storage } = await createStorage();

  try {
    const stored = await storage.getOrCreateProfile();
    const resolved = await resolvePlayerIdentity(
      [`--player-name=${OVERRIDE_PLAYER_NAME}`],
      { storage },
    );

    expect(resolved.effectivePlayerName).toBe(OVERRIDE_PLAYER_NAME);
    expect(resolved.profile.playerName).toBe(stored.profile.playerName);
    expect(resolved.source).toBe("override");
    expect((await storage.loadProfile())?.playerName).toBe(stored.profile.playerName);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("invalid CLI player name input fails fast", () => {
  expect(() => parsePlayerNameOverride(["--player-name=***"])).toThrow("Invalid player name");
  expect(() => parsePlayerNameOverride(["--player-name"])).toThrow("Missing value");
});
