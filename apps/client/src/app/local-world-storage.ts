import type { WorldSummary } from '@craftvale/core/shared'

import {
  BinaryWorldStorage,
  type StoredWorldRecord,
  type WorldStorage,
} from '@craftvale/core/server'

import { DEFAULT_CLIENT_STORAGE_ROOT } from './player-profile.ts'

export const DEFAULT_LOCAL_WORLD_STORAGE_ROOT = DEFAULT_CLIENT_STORAGE_ROOT

export class LocalWorldStorage {
  public readonly storageRoot: string

  public constructor(
    storageRoot = DEFAULT_LOCAL_WORLD_STORAGE_ROOT,
    private readonly storage: WorldStorage = new BinaryWorldStorage(storageRoot),
  ) {
    this.storageRoot = storageRoot
  }

  public async listWorlds(): Promise<WorldSummary[]> {
    return this.storage.listWorlds()
  }

  public async getWorldRecord(name: string): Promise<StoredWorldRecord | null> {
    return this.storage.getWorld(name)
  }

  public async createWorld(name: string, seed: number): Promise<StoredWorldRecord> {
    return this.storage.createWorld(name, seed)
  }

  public async deleteWorld(name: string): Promise<boolean> {
    return this.storage.deleteWorld(name)
  }
}
