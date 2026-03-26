import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export interface DecodedPng {
  width: number;
  height: number;
  pixels: Uint8Array;
}

const paethPredictor = (left: number, up: number, upLeft: number): number => {
  const predictor = left + up - upLeft;
  const distanceLeft = Math.abs(predictor - left);
  const distanceUp = Math.abs(predictor - up);
  const distanceUpLeft = Math.abs(predictor - upLeft);

  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) {
    return left;
  }

  if (distanceUp <= distanceUpLeft) {
    return up;
  }

  return upLeft;
};

const ensureSignature = (bytes: Uint8Array): void => {
  if (bytes.byteLength < PNG_SIGNATURE.length) {
    throw new Error("PNG is truncated.");
  }

  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      throw new Error("Invalid PNG signature.");
    }
  }
};

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const makeChunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.byteLength);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.byteLength, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.byteLength + data.byteLength);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.byteLength);
  view.setUint32(8 + data.byteLength, crc32(crcInput), false);
  return chunk;
};

export const encodePng = (width: number, height: number, pixels: Uint8Array): Uint8Array => {
  const signature = PNG_SIGNATURE;
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const filtered = new Uint8Array(height * (stride + 1));
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (stride + 1);
    filtered[rowStart] = 0;
    filtered.set(pixels.subarray(row * stride, (row + 1) * stride), rowStart + 1);
  }

  const idat = new Uint8Array(deflateSync(filtered));
  const iend = new Uint8Array();
  const chunks = [
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idat),
    makeChunk("IEND", iend),
  ];
  const totalLength = signature.byteLength + chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const png = new Uint8Array(totalLength);

  let offset = 0;
  png.set(signature, offset);
  offset += signature.byteLength;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return png;
};

export const decodePng = (bytes: Uint8Array): DecodedPng => {
  ensureSignature(bytes);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let idatLength = 0;
  const idatChunks: Uint8Array[] = [];

  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, false);
    offset += 4;
    const chunkType = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    offset += 4;
    const chunkData = bytes.slice(offset, offset + length);
    offset += length + 4;

    if (chunkType === "IHDR") {
      width = new DataView(chunkData.buffer, chunkData.byteOffset, chunkData.byteLength).getUint32(
        0,
        false,
      );
      height = new DataView(chunkData.buffer, chunkData.byteOffset, chunkData.byteLength).getUint32(
        4,
        false,
      );
      const bitDepth = chunkData[8];
      const colorType = chunkData[9];
      const compression = chunkData[10];
      const filter = chunkData[11];
      const interlace = chunkData[12];

      if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0) {
        throw new Error("Only non-interlaced 8-bit RGBA PNGs are supported.");
      }
    } else if (chunkType === "IDAT") {
      idatChunks.push(chunkData);
      idatLength += chunkData.byteLength;
    } else if (chunkType === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0 || idatLength === 0) {
    throw new Error("PNG is missing required chunks.");
  }

  const idat = new Uint8Array(idatLength);
  let idatOffset = 0;
  for (const chunk of idatChunks) {
    idat.set(chunk, idatOffset);
    idatOffset += chunk.byteLength;
  }

  const inflated = new Uint8Array(inflateSync(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const expectedLength = height * (stride + 1);
  if (inflated.byteLength !== expectedLength) {
    throw new Error("PNG pixel payload has an unexpected size.");
  }

  const pixels = new Uint8Array(width * height * bytesPerPixel);

  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (stride + 1);
    const filterType = inflated[rowStart]!;
    const sourceOffset = rowStart + 1;
    const targetOffset = row * stride;

    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[sourceOffset + column]!;
      const left = column >= bytesPerPixel ? pixels[targetOffset + column - bytesPerPixel]! : 0;
      const up = row > 0 ? pixels[targetOffset + column - stride]! : 0;
      const upLeft =
        row > 0 && column >= bytesPerPixel
          ? pixels[targetOffset + column - stride - bytesPerPixel]!
          : 0;

      let value = raw;
      if (filterType === 1) {
        value = (raw + left) & 0xff;
      } else if (filterType === 2) {
        value = (raw + up) & 0xff;
      } else if (filterType === 3) {
        value = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filterType === 4) {
        value = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      } else if (filterType !== 0) {
        throw new Error(`Unsupported PNG filter type ${filterType}.`);
      }

      pixels[targetOffset + column] = value;
    }
  }

  return {
    width,
    height,
    pixels,
  };
};
