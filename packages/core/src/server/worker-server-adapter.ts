import { ServerEventBus } from "../shared/event-bus.ts";
import type { ClientToServerMessage, ServerToClientMessage } from "../shared/messages.ts";

export interface WorkerLikeScope {
  postMessage(message: ServerToClientMessage, transfer?: Transferable[]): void;
}

export class WorkerServerAdapter {
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
