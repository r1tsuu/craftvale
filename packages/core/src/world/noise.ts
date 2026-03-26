export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export const lerp = (start: number, end: number, alpha: number): number =>
  start + (end - start) * alpha

export const smoothstep = (value: number): number => value * value * (3 - 2 * value)

export const hash2dInt = (x: number, z: number, seed: number): number => {
  let hash = seed ^ Math.imul(x, 0x45d9f3b) ^ Math.imul(z, 0x27d4eb2d)
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d)
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

export const hash2d = (x: number, z: number, seed: number): number => {
  const hash = hash2dInt(x, z, seed)
  return (hash / 0xffffffff) * 2 - 1
}

export const sampleValueNoise = (
  worldX: number,
  worldZ: number,
  seed: number,
  cellSize: number,
): number => {
  const scaledX = worldX / cellSize
  const scaledZ = worldZ / cellSize
  const cellX = Math.floor(scaledX)
  const cellZ = Math.floor(scaledZ)
  const tx = smoothstep(scaledX - cellX)
  const tz = smoothstep(scaledZ - cellZ)

  const topLeft = hash2d(cellX, cellZ, seed)
  const topRight = hash2d(cellX + 1, cellZ, seed)
  const bottomLeft = hash2d(cellX, cellZ + 1, seed)
  const bottomRight = hash2d(cellX + 1, cellZ + 1, seed)

  return lerp(lerp(topLeft, topRight, tx), lerp(bottomLeft, bottomRight, tx), tz)
}
