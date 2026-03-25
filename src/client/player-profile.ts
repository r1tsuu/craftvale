import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlayerName, PlayerProfile } from "../types.ts";
import { parseCliFlagValue } from "../utils/cli.ts";

const PROFILE_VERSION = 1;
const PROFILE_FILENAME = "player-profile.json";
const PLAYER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,23}$/;

const projectRoot = import.meta.dir.endsWith("/src/client")
  ? import.meta.dir.slice(0, -"/src/client".length)
  : import.meta.dir;

export const DEFAULT_CLIENT_STORAGE_ROOT = join(projectRoot, "data", "client");

export interface ResolvedPlayerIdentity {
  effectivePlayerName: PlayerName;
  profile: PlayerProfile;
  source: "stored" | "generated" | "override";
}

const toProfilePath = (storageRoot: string): string => join(storageRoot, PROFILE_FILENAME);

const createProfile = (playerName: PlayerName, now = Date.now()): PlayerProfile => ({
  version: PROFILE_VERSION,
  playerName,
  createdAt: now,
  updatedAt: now,
});

const normalizePlayerName = (value: string): string => value.trim().replace(/\s+/g, " ");

export const isValidPlayerName = (value: string): value is PlayerName =>
  PLAYER_NAME_PATTERN.test(normalizePlayerName(value));

const isDevMode = (): boolean => Bun.env.APP_ENV === "development";

const createDefaultPlayerName = (): PlayerName => {
  if (isDevMode()) {
    return "Developer";
  }

  const userToken = normalizePlayerName(Bun.env.USER ?? "");
  if (isValidPlayerName(userToken)) {
    return userToken;
  }

  const suffix = Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, "0");
  return `Player ${suffix}`;
};

export const parsePlayerNameOverride = (argv: readonly string[]): PlayerName | null => {
  const value = parseCliFlagValue(argv, "player-name");
  if (value === null) {
    return null;
  }

  const normalized = normalizePlayerName(value);
  if (!isValidPlayerName(normalized)) {
    throw new Error(
      `Invalid player name "${value}". Use 1-24 letters, numbers, spaces, "-" or "_", starting with a letter or number.`,
    );
  }

  return normalized;
};

export class JsonPlayerProfileStorage {
  public constructor(private readonly storageRoot = DEFAULT_CLIENT_STORAGE_ROOT) {}

  public async loadProfile(): Promise<PlayerProfile | null> {
    try {
      const bytes = await readFile(toProfilePath(this.storageRoot), "utf8");
      const parsed = JSON.parse(bytes) as Partial<PlayerProfile>;
      if (
        parsed.version !== PROFILE_VERSION ||
        typeof parsed.createdAt !== "number" ||
        typeof parsed.updatedAt !== "number" ||
        typeof parsed.playerName !== "string" ||
        !isValidPlayerName(parsed.playerName)
      ) {
        throw new Error("Player profile file is invalid.");
      }

      return {
        version: PROFILE_VERSION,
        playerName: normalizePlayerName(parsed.playerName),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
      };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  public async saveProfile(profile: PlayerProfile): Promise<void> {
    await mkdir(this.storageRoot, { recursive: true });
    await writeFile(
      toProfilePath(this.storageRoot),
      `${JSON.stringify(profile, null, 2)}\n`,
      "utf8",
    );
  }

  public async getOrCreateProfile(): Promise<{ profile: PlayerProfile; created: boolean }> {
    const existing = await this.loadProfile();
    if (existing) {
      return {
        profile: existing,
        created: false,
      };
    }

    const profile = createProfile(createDefaultPlayerName());
    await this.saveProfile(profile);
    return {
      profile,
      created: true,
    };
  }
}

export const resolvePlayerIdentity = async (
  argv: readonly string[],
  options: {
    storage?: JsonPlayerProfileStorage;
  } = {},
): Promise<ResolvedPlayerIdentity> => {
  const storage = options.storage ?? new JsonPlayerProfileStorage();
  const { profile, created } = await storage.getOrCreateProfile();
  const override = parsePlayerNameOverride(argv);
  if (override) {
    return {
      effectivePlayerName: override,
      profile,
      source: "override",
    };
  }

  return {
    effectivePlayerName: profile.playerName,
    profile,
    source: created ? "generated" : "stored",
  };
};
