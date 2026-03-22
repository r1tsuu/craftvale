import {
  type ClientEventMap,
  type ClientRequestMap,
  type ClientResponseMap,
  type ClientToServerMessage,
  type EventEnvelope,
  type ServerEventMap,
  type ServerEventMessage,
  type ServerToClientMessage,
  isClientEventType,
  isClientRequestType,
  isServerEventType,
} from "./messages.ts";
import type { TransferList, TransportPort } from "./transport.ts";

type MaybePromise<T> = T | Promise<T>;

type ClientEventHandler<K extends keyof ServerEventMap> = (
  payload: ServerEventMap[K],
) => MaybePromise<void>;

type ServerRequestHandler<K extends keyof ClientRequestMap> = (
  payload: ClientRequestMap[K],
) => MaybePromise<ClientResponseMap[K]>;

type ServerEventHandler<K extends keyof ClientEventMap> = (
  payload: ClientEventMap[K],
) => MaybePromise<void>;

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const getServerTransferList = (message: ServerEventMessage): TransferList => {
  if (message.type === "chunkDelivered" || message.type === "chunkChanged") {
    return [message.payload.chunk.blocks.buffer as ArrayBuffer];
  }
  return [];
};

export class ClientEventBus {
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (payload: unknown) => void;
      reject: (error: Error) => void;
      type: keyof ClientRequestMap;
    }
  >();
  private readonly eventHandlers = new Map<string, Set<(payload: unknown) => MaybePromise<void>>>();
  private requestCounter = 0;

  public constructor(
    private readonly transport: TransportPort<ServerToClientMessage, ClientToServerMessage>,
  ) {}

  public send<K extends keyof ClientRequestMap>(message: {
    type: K;
    payload: ClientRequestMap[K];
  }): Promise<ClientResponseMap[K]>;
  public send<K extends keyof ClientEventMap>(message: {
    type: K;
    payload: ClientEventMap[K];
  }): void;
  public send(message: { type: string; payload: unknown }): Promise<unknown> | void {
    if (isClientRequestType(message.type)) {
      const id = `client-${++this.requestCounter}`;
      return new Promise((resolve, reject) => {
        this.pendingRequests.set(id, {
          resolve,
          reject,
          type: message.type as keyof ClientRequestMap,
        });
        this.transport.postMessage({
          kind: "request",
          id,
          type: message.type as keyof ClientRequestMap,
          payload: message.payload as ClientRequestMap[keyof ClientRequestMap],
        });
      });
    }

    if (!isClientEventType(message.type)) {
      throw new Error(`Unknown client message type "${message.type}".`);
    }

    this.transport.postMessage({
      kind: "event",
      type: message.type,
      payload: message.payload as ClientEventMap[keyof ClientEventMap],
    });
  }

  public on<K extends keyof ServerEventMap>(
    type: K,
    handler: ClientEventHandler<K>,
  ): () => void {
    const handlers = this.eventHandlers.get(type) ?? new Set();
    handlers.add(handler as (payload: unknown) => MaybePromise<void>);
    this.eventHandlers.set(type, handlers);
    return () => {
      handlers.delete(handler as (payload: unknown) => MaybePromise<void>);
      if (handlers.size === 0) {
        this.eventHandlers.delete(type);
      }
    };
  }

  public handleIncoming(message: ServerToClientMessage): void {
    if (message.kind === "response") {
      const pending = this.pendingRequests.get(message.id);
      if (!pending) {
        return;
      }

      this.pendingRequests.delete(message.id);
      if (!message.ok) {
        pending.reject(new Error(message.error ?? `Request "${pending.type}" failed.`));
        return;
      }

      pending.resolve(message.payload);
      return;
    }

    if (!isServerEventType(message.type)) {
      return;
    }

    const handlers = this.eventHandlers.get(message.type);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      Promise.resolve(handler(message.payload)).catch((error) => {
        console.error(`Unhandled client event handler error for ${message.type}:`, error);
      });
    }
  }
}

export class ServerEventBus {
  private readonly requestHandlers = new Map<
    keyof ClientRequestMap,
    (payload: unknown) => MaybePromise<unknown>
  >();
  private readonly eventHandlers = new Map<string, Set<(payload: unknown) => MaybePromise<void>>>();

  public constructor(
    private readonly transport: TransportPort<ClientToServerMessage, ServerToClientMessage>,
  ) {}

  public send<K extends keyof ServerEventMap>(message: {
    type: K;
    payload: ServerEventMap[K];
  }): void {
    const transferList = getServerTransferList(message as ServerEventMessage);
    this.transport.postMessage(
      {
        kind: "event",
        type: message.type,
        payload: message.payload,
      } satisfies EventEnvelope,
      transferList,
    );
  }

  public on<K extends keyof ClientRequestMap>(
    type: K,
    handler: ServerRequestHandler<K>,
  ): () => void;
  public on<K extends keyof ClientEventMap>(
    type: K,
    handler: ServerEventHandler<K>,
  ): () => void;
  public on(
    type: keyof ClientRequestMap | keyof ClientEventMap,
    handler: ((payload: unknown) => MaybePromise<unknown>) | ((payload: unknown) => MaybePromise<void>),
  ): () => void {
    if (isClientRequestType(type)) {
      this.requestHandlers.set(type, handler as (payload: unknown) => MaybePromise<unknown>);
      return () => {
        this.requestHandlers.delete(type);
      };
    }

    const handlers = this.eventHandlers.get(type) ?? new Set();
    handlers.add(handler as (payload: unknown) => MaybePromise<void>);
    this.eventHandlers.set(type, handlers);
    return () => {
      handlers.delete(handler as (payload: unknown) => MaybePromise<void>);
      if (handlers.size === 0) {
        this.eventHandlers.delete(type);
      }
    };
  }

  public async handleIncoming(message: ClientToServerMessage): Promise<void> {
    if (message.kind === "request") {
      const handler = this.requestHandlers.get(message.type);
      if (!handler) {
        this.transport.postMessage({
          kind: "response",
          id: message.id,
          type: message.type,
          ok: false,
          error: `Unknown request type "${message.type}".`,
        });
        this.send({
          type: "serverError",
          payload: {
            message: `Unknown request type "${message.type}".`,
            requestId: message.id,
          },
        });
        return;
      }

      try {
        const payload = await handler(message.payload);
        this.transport.postMessage({
          kind: "response",
          id: message.id,
          type: message.type,
          ok: true,
          payload: payload as ClientResponseMap[keyof ClientResponseMap],
        });
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        this.transport.postMessage({
          kind: "response",
          id: message.id,
          type: message.type,
          ok: false,
          error: errorMessage,
        });
        this.send({
          type: "serverError",
          payload: {
            message: errorMessage,
            requestId: message.id,
          },
        });
      }
      return;
    }

    if (!isClientEventType(message.type)) {
      this.send({
        type: "serverError",
        payload: {
          message: `Unknown client event type "${message.type}".`,
        },
      });
      return;
    }

    const handlers = this.eventHandlers.get(message.type);
    if (!handlers || handlers.size === 0) {
      this.send({
        type: "serverError",
        payload: {
          message: `No handler registered for client event "${message.type}".`,
        },
      });
      return;
    }

    for (const handler of handlers) {
      try {
        await handler(message.payload);
      } catch (error) {
        this.send({
          type: "serverError",
          payload: {
            message: toErrorMessage(error),
          },
        });
      }
    }
  }
}
