import type { ClientToServerMessage, ServerToClientMessage } from '../shared/messages.ts'
import type { TransportPort } from '../shared/transport.ts'

import { ServerEventBus } from '../shared/event-bus.ts'

export interface IServerAdapter {
  readonly eventBus: ServerEventBus
  close(): void
}

export class PortServerAdapter implements IServerAdapter {
  public readonly eventBus: ServerEventBus

  public constructor(
    protected readonly transport: TransportPort<ClientToServerMessage, ServerToClientMessage>,
  ) {
    this.eventBus = new ServerEventBus(transport)
    this.transport.setMessageHandler((message) => {
      void this.eventBus.handleIncoming(message)
    })
  }

  public close(): void {
    this.transport.close?.()
  }
}
