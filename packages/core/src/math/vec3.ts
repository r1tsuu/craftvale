export interface Vec3 {
  x: number
  y: number
  z: number
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })

export const addVec3 = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z)

export const subVec3 = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z)

export const scaleVec3 = (value: Vec3, scale: number): Vec3 =>
  vec3(value.x * scale, value.y * scale, value.z * scale)

export const lengthVec3 = (value: Vec3): number =>
  Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z)

export const normalizeVec3 = (value: Vec3): Vec3 => {
  const len = lengthVec3(value)
  if (len === 0) {
    return vec3()
  }
  return scaleVec3(value, 1 / len)
}

export const crossVec3 = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)

export const dotVec3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
