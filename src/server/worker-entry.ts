import { DEFAULT_WORLD_STORAGE_ROOT, ServerRuntime } from "./runtime.ts";
import { BinaryWorldStorage } from "./world-storage.ts";
import { WorkerServerAdapter } from "./worker-server-adapter.ts";
import type { ClientToServerMessage } from "../shared/messages.ts";

interface WorkerInitMessage {
  kind: "internal:init";
  storageRoot?: string;
}

type WorkerInboundMessage = ClientToServerMessage | WorkerInitMessage;

const scope = globalThis as typeof globalThis & {
  onmessage: ((event: MessageEvent<WorkerInboundMessage>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  close(): void;
};

let runtime: ServerRuntime | null = null;
let adapter: WorkerServerAdapter | null = null;

scope.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;

  if (message.kind === "internal:init") {
    adapter = new WorkerServerAdapter(scope);
    runtime = new ServerRuntime(
      {
        eventBus: adapter.eventBus,
        close: () => scope.close(),
      },
      new BinaryWorldStorage(message.storageRoot ?? DEFAULT_WORLD_STORAGE_ROOT),
    );
    return;
  }

  if (!adapter || !runtime) {
    throw new Error("Worker server received a message before initialization.");
  }

  adapter.handleMessage(message);
};
