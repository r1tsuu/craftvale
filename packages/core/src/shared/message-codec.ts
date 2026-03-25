import { Buffer } from "node:buffer";
import type { ClientToServerMessage, ServerToClientMessage } from "./messages.ts";

type TransportMessage = ClientToServerMessage | ServerToClientMessage;

interface EncodedBytes {
  __type: "Uint8Array";
  base64: string;
}

const isUint8Array = (value: unknown): value is Uint8Array =>
  value instanceof Uint8Array;

const isEncodedBytes = (value: unknown): value is EncodedBytes =>
  typeof value === "object" &&
  value !== null &&
  "__type" in value &&
  "base64" in value &&
  (value as { __type?: unknown }).__type === "Uint8Array" &&
  typeof (value as { base64?: unknown }).base64 === "string";

const encodeValue = (_key: string, value: unknown): unknown => {
  if (isUint8Array(value)) {
    return {
      __type: "Uint8Array",
      base64: Buffer.from(value).toString("base64"),
    } satisfies EncodedBytes;
  }

  return value;
};

const decodeValue = (_key: string, value: unknown): unknown => {
  if (isEncodedBytes(value)) {
    return new Uint8Array(Buffer.from(value.base64, "base64"));
  }

  return value;
};

export const encodeTransportMessage = (message: TransportMessage): string =>
  JSON.stringify(message, encodeValue);

export const decodeClientToServerMessage = (encoded: string): ClientToServerMessage =>
  JSON.parse(encoded, decodeValue) as ClientToServerMessage;

export const decodeServerToClientMessage = (encoded: string): ServerToClientMessage =>
  JSON.parse(encoded, decodeValue) as ServerToClientMessage;
