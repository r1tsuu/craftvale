import { AuthoritativeWorld, BinaryWorldStorage, ServerRuntime, type StoredWorldRecord } from "@voxel/core/server";
import { createLogger, type ClientToServerMessage, type ServerToClientMessage } from "@voxel/core/shared";
import { ServerEventBus } from "@voxel/core/shared";
import { DEFAULT_LOCAL_WORLD_STORAGE_ROOT } from "../client/local-world-storage.ts";

const workerLogger = createLogger("worker", "green");

export interface WorkerLikeScope {
  postMessage(message: ServerToClientMessage, transfer?: Transferable[]): void;
}

class WorkerServerAdapter {
  public readonly eventBus: ServerEventBus;

  public constructor(private readonly scope: WorkerLikeScope) {
    this.eventBus = new ServerEventBus({
      postMessage: (message, transfer = []) => {
        this.scope.postMessage(message, [...transfer] as Transferable[]);
      },
      setMessageHandler(): void {},
    });
  }

  public handleMessage(message: ClientToServerMessage): void {
    void this.eventBus.handleIncoming(message);
  }

  public close(): void {}
}

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
    const storage = new BinaryWorldStorage(storageRoot ?? DEFAULT_LOCAL_WORLD_STORAGE_ROOT);
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
