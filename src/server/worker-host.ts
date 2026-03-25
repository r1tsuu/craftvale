import { AuthoritativeWorld } from "./authoritative-world.ts";
import type { ClientToServerMessage } from "../shared/messages.ts";
import { DEFAULT_WORLD_STORAGE_ROOT, ServerRuntime } from "./runtime.ts";
import { createLogger } from "../utils/logger.ts";
import { BinaryWorldStorage, type StoredWorldRecord } from "./world-storage.ts";
import { WorkerServerAdapter, type WorkerLikeScope } from "./worker-server-adapter.ts";

const workerLogger = createLogger("worker", "green");

export interface WorkerInitMessage {
  kind: "internal:init";
  storageRoot?: string;
  world: StoredWorldRecord;
}

export type WorkerInboundMessage = ClientToServerMessage | WorkerInitMessage;

export class WorkerServerHost {
  private runtime: ServerRuntime | null = null;
  private adapter: WorkerServerAdapter | null = null;

  public constructor(private readonly scope: WorkerLikeScope & { close(): void }) {}

  public handleMessage(message: WorkerInboundMessage): void {
    if (message.kind === "internal:init") {
      this.initialize(message.world, message.storageRoot);
      return;
    }

    if (!this.adapter || !this.runtime) {
      throw new Error("Worker server received a message before initialization.");
    }

    this.adapter.handleMessage(message);
  }

  private initialize(world: StoredWorldRecord, storageRoot?: string): void {
    if (this.adapter || this.runtime) {
      this.logInfo(`ignoring duplicate init for world "${world.name}"`);
      return;
    }

    this.logInfo(
      `booting local singleplayer worker for world "${world.name}" (seed ${world.seed})`,
    );
    const adapter = new WorkerServerAdapter(this.scope);
    const storage = new BinaryWorldStorage(storageRoot ?? DEFAULT_WORLD_STORAGE_ROOT);
    this.adapter = adapter;
    this.runtime = new ServerRuntime(
      {
        eventBus: adapter.eventBus,
        close: () => {
          this.logInfo(`closing worker for world "${world.name}"`);
          this.scope.close();
        },
      },
      new AuthoritativeWorld(world, storage),
      {
        logInfo: (message) => this.logInfo(message),
      },
    );
  }

  private logInfo(message: string): void {
    workerLogger.info(message);
  }
}

export const attachWorkerServerHost = (
  scope: WorkerLikeScope & {
    onmessage: ((event: MessageEvent<WorkerInboundMessage>) => void) | null;
    close(): void;
  },
): void => {
  const host = new WorkerServerHost(scope);
  scope.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
    host.handleMessage(event.data);
  };
};
