import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CLIENT_STORAGE_ROOT } from "./player-profile.ts";
import type { ClientSettings } from "../types.ts";

const SETTINGS_VERSION = 1;
const SETTINGS_FILENAME = "client-settings.json";
const DEFAULT_CLIENT_SETTINGS: ClientSettings = {
  fovDegrees: 70,
  mouseSensitivity: 100,
  renderDistance: 2,
  showDebugOverlay: true,
  showCrosshair: true,
};

interface PersistedClientSettings extends ClientSettings {
  version: 1;
}

export const CLIENT_SETTINGS_LIMITS = {
  fovDegrees: { min: 50, max: 110, step: 1 },
  mouseSensitivity: { min: 25, max: 200, step: 5 },
  renderDistance: { min: 2, max: 8, step: 1 },
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundToStep = (value: number, step: number): number =>
  Math.round(value / step) * step;

const normalizeNumericSetting = (
  value: unknown,
  limits: { min: number; max: number; step: number },
  fallback: number,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(roundToStep(value, limits.step), limits.min, limits.max);
};

export const cloneClientSettings = (settings: ClientSettings): ClientSettings => ({
  fovDegrees: settings.fovDegrees,
  mouseSensitivity: settings.mouseSensitivity,
  renderDistance: settings.renderDistance,
  showDebugOverlay: settings.showDebugOverlay,
  showCrosshair: settings.showCrosshair,
});

export const createDefaultClientSettings = (): ClientSettings =>
  cloneClientSettings(DEFAULT_CLIENT_SETTINGS);

export const normalizeClientSettings = (settings: Partial<ClientSettings> | null | undefined): ClientSettings => ({
  fovDegrees: normalizeNumericSetting(
    settings?.fovDegrees,
    CLIENT_SETTINGS_LIMITS.fovDegrees,
    DEFAULT_CLIENT_SETTINGS.fovDegrees,
  ),
  mouseSensitivity: normalizeNumericSetting(
    settings?.mouseSensitivity,
    CLIENT_SETTINGS_LIMITS.mouseSensitivity,
    DEFAULT_CLIENT_SETTINGS.mouseSensitivity,
  ),
  renderDistance: normalizeNumericSetting(
    settings?.renderDistance,
    CLIENT_SETTINGS_LIMITS.renderDistance,
    DEFAULT_CLIENT_SETTINGS.renderDistance,
  ),
  showDebugOverlay: typeof settings?.showDebugOverlay === "boolean"
    ? settings.showDebugOverlay
    : DEFAULT_CLIENT_SETTINGS.showDebugOverlay,
  showCrosshair: typeof settings?.showCrosshair === "boolean"
    ? settings.showCrosshair
    : DEFAULT_CLIENT_SETTINGS.showCrosshair,
});

const toSettingsPath = (storageRoot: string): string => join(storageRoot, SETTINGS_FILENAME);

export class JsonClientSettingsStorage {
  public constructor(private readonly storageRoot = DEFAULT_CLIENT_STORAGE_ROOT) {}

  public async loadSettings(): Promise<ClientSettings | null> {
    try {
      const bytes = await readFile(toSettingsPath(this.storageRoot), "utf8");
      const parsed = JSON.parse(bytes) as Partial<PersistedClientSettings>;
      if (parsed.version !== SETTINGS_VERSION) {
        throw new Error("Client settings file is invalid.");
      }

      return normalizeClientSettings(parsed);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  public async saveSettings(settings: ClientSettings): Promise<void> {
    await mkdir(this.storageRoot, { recursive: true });
    const persisted: PersistedClientSettings = {
      version: SETTINGS_VERSION,
      ...normalizeClientSettings(settings),
    };
    await writeFile(
      toSettingsPath(this.storageRoot),
      `${JSON.stringify(persisted, null, 2)}\n`,
      "utf8",
    );
  }

  public async getOrCreateSettings(): Promise<{ settings: ClientSettings; created: boolean }> {
    const existing = await this.loadSettings();
    if (existing) {
      return {
        settings: existing,
        created: false,
      };
    }

    const settings = createDefaultClientSettings();
    await this.saveSettings(settings);
    return {
      settings,
      created: true,
    };
  }
}

export const formatFovSetting = (value: number): string => `${value}`;
export const formatSensitivitySetting = (value: number): string => `${value}%`;
export const formatRenderDistanceSetting = (value: number): string => `${value} CHUNKS`;
