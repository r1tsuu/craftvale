import {
  ClientEventBus,
  type ClientToServerMessage,
  type ServerToClientMessage,
  type TransportPort,
} from "@voxel/core/shared";

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
