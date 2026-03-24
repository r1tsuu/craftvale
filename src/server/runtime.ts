import { join } from "node:path";
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
  private readonly session: WorldSessionController;

  public constructor(
    private readonly adapter: Pick<IServerAdapter, "eventBus" | "close">,
    private readonly world: AuthoritativeWorld,
  ) {
    const host: WorldSessionHost = {
      contextLabel: "world",
      getWorld: () => this.world,
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
    await this.session.disconnect();
    await this.world.save();
    this.session.dispose();
    this.adapter.close();
  }

  private registerHandlers(): void {
    this.adapter.eventBus.on("joinWorld", async ({ playerName }) => {
      return this.session.join(playerName, {
        emitLoadingProgress: true,
      });
    });
  }
}
