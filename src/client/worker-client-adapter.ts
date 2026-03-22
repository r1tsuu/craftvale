import { PortClientAdapter } from "./client-adapter.ts";
import type { ClientToServerMessage, ServerToClientMessage } from "../shared/messages.ts";
import type { TransferList, TransportPort } from "../shared/transport.ts";

interface WorkerInitMessage {
  kind: "internal:init";
  storageRoot?: string;
}

type WorkerInboundMessage = ServerToClientMessage;
type WorkerOutboundMessage = ClientToServerMessage | WorkerInitMessage;

const createWorkerTransport = (
  worker: Worker,
): TransportPort<WorkerInboundMessage, WorkerOutboundMessage> => ({
  postMessage(message: WorkerOutboundMessage, transfer: TransferList = []): void {
    worker.postMessage(message, [...transfer] as Transferable[]);
  },
  setMessageHandler(handler: (message: WorkerInboundMessage) => void): void {
    worker.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
      handler(event.data);
    };
  },
  close(): void {
    worker.terminate();
  },
});

export class WorkerClientAdapter extends PortClientAdapter {
  private readonly worker: Worker;

  public constructor(options: { storageRoot?: string } = {}) {
    const worker = new Worker(new URL("../server/worker-entry.ts", import.meta.url).href, {
      type: "module",
    });
    const transport = createWorkerTransport(worker);
    super(transport as unknown as TransportPort<ServerToClientMessage, ClientToServerMessage>);
    this.worker = worker;
    transport.postMessage({
      kind: "internal:init",
      storageRoot: options.storageRoot,
    });
  }

  public override close(): void {
    this.worker.terminate();
  }
}
