import { expect, test } from "bun:test";
import {
  DEFAULT_LOCAL_WORLD_STORAGE_ROOT,
  LocalWorldStorage,
} from "../apps/client/src/client/local-world-storage.ts";
import { DEFAULT_CLIENT_STORAGE_ROOT } from "../apps/client/src/client/player-profile.ts";

test("local world storage defaults to the client dist directory", () => {
  expect(DEFAULT_LOCAL_WORLD_STORAGE_ROOT).toBe(DEFAULT_CLIENT_STORAGE_ROOT);

  const storage = new LocalWorldStorage();
  expect(storage.storageRoot).toBe(DEFAULT_LOCAL_WORLD_STORAGE_ROOT);
});
