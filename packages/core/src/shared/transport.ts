export type TransferList = readonly ArrayBuffer[]

export interface TransportPort<IncomingMessage, OutgoingMessage> {
  postMessage(message: OutgoingMessage, transfer?: TransferList): void
  setMessageHandler(handler: (message: IncomingMessage) => void): void
  close?(): void
}

export const createInMemoryTransportPair = <
  LeftIncoming,
  LeftOutgoing,
  RightIncoming = LeftOutgoing,
  RightOutgoing = LeftIncoming,
>(): {
  left: TransportPort<LeftIncoming, LeftOutgoing>
  right: TransportPort<RightIncoming, RightOutgoing>
} => {
  let leftHandler: ((message: LeftIncoming) => void) | null = null
  let rightHandler: ((message: RightIncoming) => void) | null = null

  return {
    left: {
      postMessage(message: LeftOutgoing): void {
        queueMicrotask(() => {
          rightHandler?.(message as unknown as RightIncoming)
        })
      },
      setMessageHandler(handler: (message: LeftIncoming) => void): void {
        leftHandler = handler
      },
    },
    right: {
      postMessage(message: RightOutgoing): void {
        queueMicrotask(() => {
          leftHandler?.(message as unknown as LeftIncoming)
        })
      },
      setMessageHandler(handler: (message: RightIncoming) => void): void {
        rightHandler = handler
      },
    },
  }
}
