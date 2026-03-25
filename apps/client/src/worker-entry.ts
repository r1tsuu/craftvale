import { attachWorkerServerHost, type WorkerInboundMessage } from "./worker/host.ts";

const scope = globalThis as typeof globalThis & {
  onmessage: ((event: MessageEvent<WorkerInboundMessage>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  close(): void;
};

attachWorkerServerHost(scope);
