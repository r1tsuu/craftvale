import { expect, test } from "bun:test";
import {
  decodeClientToServerMessage,
  decodeServerToClientMessage,
  encodeTransportMessage,
} from "../src/shared/message-codec.ts";

test("transport codec round-trips chunk payload bytes for server messages", () => {
  const encoded = encodeTransportMessage({
    kind: "event",
    type: "chunkDelivered",
    payload: {
      chunk: {
        coord: { x: 1, y: 0, z: -2 },
        blocks: new Uint8Array([1, 2, 3, 255]),
        revision: 4,
      },
    },
  });

  const decoded = decodeServerToClientMessage(encoded);
  if (decoded.kind !== "event" || decoded.type !== "chunkDelivered") {
    throw new Error("Decoded message had the wrong shape.");
  }

  const chunkPayload = (decoded.payload as {
    chunk: {
      blocks: Uint8Array;
    };
  }).chunk;
  expect(chunkPayload.blocks).toBeInstanceOf(Uint8Array);
  expect([...chunkPayload.blocks]).toEqual([1, 2, 3, 255]);
});

test("transport codec round-trips request payloads for client messages", () => {
  const encoded = encodeTransportMessage({
    kind: "request",
    id: "client-1",
    type: "requestChunks",
    payload: {
      coords: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
    },
  });

  const decoded = decodeClientToServerMessage(encoded);
  expect(decoded).toEqual({
    kind: "request",
    id: "client-1",
    type: "requestChunks",
    payload: {
      coords: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
    },
  });
});
