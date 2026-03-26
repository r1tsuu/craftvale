import {
  type ClientToServerMessage,
  decodeServerToClientMessage,
  encodeTransportMessage,
  type ServerToClientMessage,
  type TransportPort,
} from '@craftvale/core/shared'

import { PortClientAdapter } from './client-adapter.ts'

const createWebSocketTransport = (
  socket: WebSocket,
): TransportPort<ServerToClientMessage, ClientToServerMessage> => {
  let messageHandler: ((message: ServerToClientMessage) => void) | null = null

  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') {
      return
    }

    messageHandler?.(decodeServerToClientMessage(event.data))
  })

  return {
    postMessage(message): void {
      socket.send(encodeTransportMessage(message))
    },
    setMessageHandler(handler): void {
      messageHandler = handler
    },
    close(): void {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close()
      }
    },
  }
}

export class WebSocketClientAdapter extends PortClientAdapter {
  private constructor(private readonly socket: WebSocket) {
    super(createWebSocketTransport(socket))
  }

  public static async connect(url: string): Promise<WebSocketClientAdapter> {
    const socket = new WebSocket(url)
    const adapter = new WebSocketClientAdapter(socket)

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        socket.removeEventListener('open', onOpen)
        socket.removeEventListener('error', onError)
      }

      const onOpen = (): void => {
        cleanup()
        resolve()
      }

      const onError = (): void => {
        cleanup()
        reject(new Error(`Failed to connect to ${url}.`))
      }

      socket.addEventListener('open', onOpen, { once: true })
      socket.addEventListener('error', onError, { once: true })
    })

    return adapter
  }

  public override close(): void {
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close()
    }
  }
}
