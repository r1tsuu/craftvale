import { DEFAULT_WORLD_STORAGE_ROOT } from "../server/runtime.ts";
import {
  BinaryWorldStorage,
  type StoredWorldRecord,
  type WorldStorage,
} from "../server/world-storage.ts";
import type { WorldSummary } from "../shared/messages.ts";

export class LocalWorldStorage {
  public constructor(
    private readonly storage: WorldStorage = new BinaryWorldStorage(
      DEFAULT_WORLD_STORAGE_ROOT,
    ),
  ) {}

  public async listWorlds(): Promise<WorldSummary[]> {
    return this.storage.listWorlds();
  }

  public async getWorldRecord(name: string): Promise<StoredWorldRecord | null> {
    return this.storage.getWorld(name);
  }

  public async createWorld(name: string, seed: number): Promise<StoredWorldRecord> {
    return this.storage.createWorld(name, seed);
  }

  public async deleteWorld(name: string): Promise<boolean> {
    return this.storage.deleteWorld(name);
  }
}
