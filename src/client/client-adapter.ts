import { ClientEventBus } from "../shared/event-bus.ts";
import type { ClientToServerMessage, ServerToClientMessage } from "../shared/messages.ts";
import type { TransportPort } from "../shared/transport.ts";

export interface IClientAdapter {
  readonly eventBus: ClientEventBus;
  close(): void;
}

export class PortClientAdapter implements IClientAdapter {
  public readonly eventBus: ClientEventBus;

  public constructor(
    protected readonly transport: TransportPort<ServerToClientMessage, ClientToServerMessage>,
  ) {
    this.eventBus = new ClientEventBus(transport);
    this.transport.setMessageHandler((message) => {
      this.eventBus.handleIncoming(message);
    });
  }

  public close(): void {
    this.transport.close?.();
  }
}
