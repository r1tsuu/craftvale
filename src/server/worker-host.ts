import type { ClientToServerMessage } from "../shared/messages.ts";
import { DEFAULT_WORLD_STORAGE_ROOT, ServerRuntime } from "./runtime.ts";
import { BinaryWorldStorage } from "./world-storage.ts";
import { WorkerServerAdapter, type WorkerLikeScope } from "./worker-server-adapter.ts";

export interface WorkerInitMessage {
  kind: "internal:init";
  storageRoot?: string;
}

export type WorkerInboundMessage = ClientToServerMessage | WorkerInitMessage;

export class WorkerServerHost {
  private runtime: ServerRuntime | null = null;
  private adapter: WorkerServerAdapter | null = null;

  public constructor(private readonly scope: WorkerLikeScope & { close(): void }) {}

  public handleMessage(message: WorkerInboundMessage): void {
    if (message.kind === "internal:init") {
      this.initialize(message.storageRoot);
      return;
    }

    if (!this.adapter || !this.runtime) {
      throw new Error("Worker server received a message before initialization.");
    }

    this.adapter.handleMessage(message);
  }

  private initialize(storageRoot?: string): void {
    if (this.adapter || this.runtime) {
      return;
    }

    const adapter = new WorkerServerAdapter(this.scope);
    this.adapter = adapter;
    this.runtime = new ServerRuntime(
      {
        eventBus: adapter.eventBus,
        close: () => this.scope.close(),
      },
      new BinaryWorldStorage(storageRoot ?? DEFAULT_WORLD_STORAGE_ROOT),
    );
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
