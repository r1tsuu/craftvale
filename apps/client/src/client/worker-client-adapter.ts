import type { StoredWorldRecord } from "@voxel/core/server";
import { PortClientAdapter } from "./client-adapter.ts";
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  TransferList,
  TransportPort,
} from "@voxel/core/shared";

interface WorkerInitMessage {
  kind: "internal:init";
  storageRoot?: string;
  world: StoredWorldRecord;
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

  public constructor(options: { storageRoot?: string; world: StoredWorldRecord }) {
    const worker = new Worker(new URL("../worker-entry.ts", import.meta.url).href, {
      type: "module",
    });
    const transport = createWorkerTransport(worker);
    super(transport as unknown as TransportPort<ServerToClientMessage, ClientToServerMessage>);
    this.worker = worker;
    transport.postMessage({
      kind: "internal:init",
      storageRoot: options.storageRoot,
      world: options.world,
    });
  }

  public override close(): void {
    this.worker.terminate();
  }
}
