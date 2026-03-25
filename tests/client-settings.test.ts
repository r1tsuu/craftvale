import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  JsonClientSettingsStorage,
  createDefaultClientSettings,
  normalizeClientSettings,
} from "../apps/client/src/client/client-settings.ts";

const createStorage = async (): Promise<{
  rootDir: string;
  storage: JsonClientSettingsStorage;
}> => {
  const rootDir = await mkdtemp(join(tmpdir(), "craftvale-client-settings-"));
  return {
    rootDir,
    storage: new JsonClientSettingsStorage(rootDir),
  };
};

test("client settings storage creates defaults and reuses them", async () => {
  const { rootDir, storage } = await createStorage();

  try {
    const first = await storage.getOrCreateSettings();
    const second = await storage.getOrCreateSettings();

    expect(first.created).toBe(true);
    expect(first.settings).toEqual(createDefaultClientSettings());
    expect(second.created).toBe(false);
    expect(second.settings).toEqual(first.settings);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("client settings loading clamps invalid saved values", async () => {
  const { rootDir, storage } = await createStorage();

  try {
    await writeFile(
      join(rootDir, "client-settings.json"),
      `${JSON.stringify({
        version: 1,
        fovDegrees: 400,
        mouseSensitivity: -10,
        renderDistance: 99,
        showDebugOverlay: "yes",
        showCrosshair: false,
      }, null, 2)}\n`,
      "utf8",
    );

    expect(await storage.loadSettings()).toEqual({
      fovDegrees: 110,
      mouseSensitivity: 25,
      renderDistance: 8,
      showDebugOverlay: true,
      showCrosshair: false,
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("normalizeClientSettings fills missing fields from defaults", () => {
  expect(
    normalizeClientSettings({
      fovDegrees: 80,
    }),
  ).toEqual({
    ...createDefaultClientSettings(),
    fovDegrees: 80,
  });
});
