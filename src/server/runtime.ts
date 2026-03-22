import { join } from "node:path";
import { type JoinedWorldPayload, type SaveStatusPayload } from "../shared/messages.ts";
import { AuthoritativeWorld } from "./authoritative-world.ts";
import { BinaryWorldStorage, type WorldStorage } from "./world-storage.ts";
import type { IServerAdapter } from "./server-adapter.ts";

const projectRoot = import.meta.dir.endsWith("/src/server")
  ? import.meta.dir.slice(0, -"/src/server".length)
  : import.meta.dir;

export const DEFAULT_WORLD_STORAGE_ROOT = join(projectRoot, "data");

export class ServerRuntime {
  private activeWorld: AuthoritativeWorld | null = null;

  public constructor(
    private readonly adapter: Pick<IServerAdapter, "eventBus" | "close">,
    private readonly storage: WorldStorage = new BinaryWorldStorage(DEFAULT_WORLD_STORAGE_ROOT),
  ) {
    this.registerHandlers();
  }

  public async shutdown(): Promise<void> {
    await this.flushActiveWorld();
    this.adapter.close();
  }

  private registerHandlers(): void {
    this.adapter.eventBus.on("listWorlds", async () => ({
      worlds: await this.storage.listWorlds(),
    }));

    this.adapter.eventBus.on("createWorld", async ({ name, seed }) => ({
      world: await this.storage.createWorld(name, seed),
    }));

    this.adapter.eventBus.on("joinWorld", async ({ name }) => {
      await this.flushActiveWorld();
      const world = await this.storage.getWorld(name);
      if (!world) {
        throw new Error(`World "${name}" does not exist.`);
      }

      this.activeWorld = new AuthoritativeWorld(world, this.storage);
      const payload: JoinedWorldPayload = {
        world: this.activeWorld.summary,
        spawnPosition: this.activeWorld.spawnPosition,
      };
      this.adapter.eventBus.send({
        type: "joinedWorld",
        payload,
      });
      return payload;
    });

    this.adapter.eventBus.on("requestChunks", async ({ coords }) => {
      if (!this.activeWorld) {
        throw new Error("Join a world before requesting chunks.");
      }

      const seen = new Set<string>();
      let accepted = 0;

      for (const coord of coords) {
        const key = `${coord.x},${coord.y},${coord.z}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        const chunk = await this.activeWorld.getChunkPayload(coord);
        this.adapter.eventBus.send({
          type: "chunkDelivered",
          payload: { chunk },
        });
        accepted += 1;
      }

      return { accepted };
    });

    this.adapter.eventBus.on("saveWorld", async () => {
      if (!this.activeWorld) {
        throw new Error("Join a world before saving.");
      }

      try {
        const result = await this.activeWorld.save();
        this.emitSaveStatus({
          worldName: result.world.name,
          savedChunks: result.savedChunks,
          success: true,
        });
        return result;
      } catch (error) {
        this.emitSaveStatus({
          worldName: this.activeWorld.summary.name,
          savedChunks: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });

    this.adapter.eventBus.on("deleteWorld", async ({ name }) => {
      if (this.activeWorld?.summary.name === name) {
        await this.flushActiveWorld();
        this.activeWorld = null;
      }

      const deleted = await this.storage.deleteWorld(name);
      if (deleted) {
        this.adapter.eventBus.send({
          type: "worldDeleted",
          payload: { name },
        });
      }
      return { deleted, name };
    });

    this.adapter.eventBus.on("mutateBlock", async ({ x, y, z, blockId }) => {
      if (!this.activeWorld) {
        throw new Error("Join a world before mutating blocks.");
      }

      const changedChunks = await this.activeWorld.applyBlockMutation(x, y, z, blockId);
      for (const chunk of changedChunks) {
        this.adapter.eventBus.send({
          type: "chunkChanged",
          payload: { chunk },
        });
      }
    });
  }

  private emitSaveStatus(payload: SaveStatusPayload): void {
    this.adapter.eventBus.send({
      type: "saveStatus",
      payload,
    });
  }

  private async flushActiveWorld(): Promise<void> {
    if (!this.activeWorld) {
      return;
    }

    await this.activeWorld.save();
  }
}
