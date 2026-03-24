import { join } from "node:path";
import { BinaryWorldStorage, type WorldStorage } from "./world-storage.ts";
import type { IServerAdapter } from "./server-adapter.ts";
import { AuthoritativeWorld } from "./authoritative-world.ts";
import {
  WorldSessionController,
  type WorldSessionHost,
} from "./world-session-controller.ts";

const projectRoot = import.meta.dir.endsWith("/src/server")
  ? import.meta.dir.slice(0, -"/src/server".length)
  : import.meta.dir;

export const DEFAULT_WORLD_STORAGE_ROOT = join(projectRoot, "data");

export class ServerRuntime {
  private activeWorld: AuthoritativeWorld | null = null;
  private readonly session: WorldSessionController;

  public constructor(
    private readonly adapter: Pick<IServerAdapter, "eventBus" | "close">,
    private readonly storage: WorldStorage = new BinaryWorldStorage(DEFAULT_WORLD_STORAGE_ROOT),
  ) {
    const host: WorldSessionHost = {
      contextLabel: "world",
      getWorld: () => this.activeWorld,
      sendToPlayer: (_playerEntityId, message) => {
        this.session.sendEvent(message);
      },
      broadcast: (message) => {
        this.session.sendEvent(message);
      },
      afterLeave: (player) => {
        this.session.sendEvent({
          type: "playerLeft",
          payload: {
            playerEntityId: player.entityId,
            playerName: player.name,
          },
        });
      },
    };

    this.session = new WorldSessionController(host, adapter);
    this.registerHandlers();
  }

  public async shutdown(): Promise<void> {
    await this.flushActiveWorld();
    this.session.dispose();
    this.adapter.close();
  }

  private registerHandlers(): void {
    this.adapter.eventBus.on("listWorlds", async () => ({
      worlds: await this.storage.listWorlds(),
    }));

    this.adapter.eventBus.on("createWorld", async ({ name, seed }) => ({
      world: await this.storage.createWorld(name, seed),
    }));

    this.adapter.eventBus.on("joinWorld", async ({ name, playerName }) => {
      if (this.activeWorld?.summary.name !== name) {
        await this.flushActiveWorld();

        const world = await this.storage.getWorld(name);
        if (!world) {
          throw new Error(`World "${name}" does not exist.`);
        }

        this.activeWorld = new AuthoritativeWorld(world, this.storage);
      }

      return this.session.join(playerName);
    });

    this.adapter.eventBus.on("deleteWorld", async ({ name }) => {
      if (this.activeWorld?.summary.name === name) {
        await this.flushActiveWorld();
      }

      const deleted = await this.storage.deleteWorld(name);
      if (deleted) {
        this.session.sendEvent({
          type: "worldDeleted",
          payload: { name },
        });
      }
      return { deleted, name };
    });
  }

  private async flushActiveWorld(): Promise<void> {
    if (!this.activeWorld) {
      return;
    }

    await this.session.disconnect();
    await this.activeWorld.save();
    this.activeWorld = null;
  }
}
