import { crossVec3, normalizeVec3, subVec3, type Vec3 } from './vec3.ts'

export type Mat4 = Float32Array

export const createIdentityMat4 = (): Mat4 =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

export const multiplyMat4 = (a: Mat4, b: Mat4): Mat4 => {
  const out = new Float32Array(16)

  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3]
    }
  }

  return out
}

export const createPerspectiveMat4 = (
  fovRadians: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 => {
  const f = 1 / Math.tan(fovRadians / 2)
  const rangeInverse = 1 / (near - far)

  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (near + far) * rangeInverse,
    -1,
    0,
    0,
    near * far * 2 * rangeInverse,
    0,
  ])
}

export const createLookAtMat4 = (eye: Vec3, target: Vec3, up: Vec3): Mat4 => {
  const zAxis = normalizeVec3(subVec3(eye, target))
  const xAxis = normalizeVec3(crossVec3(up, zAxis))
  const yAxis = crossVec3(zAxis, xAxis)

  return new Float32Array([
    xAxis.x,
    yAxis.x,
    zAxis.x,
    0,
    xAxis.y,
    yAxis.y,
    zAxis.y,
    0,
    xAxis.z,
    yAxis.z,
    zAxis.z,
    0,
    -(xAxis.x * eye.x + xAxis.y * eye.y + xAxis.z * eye.z),
    -(yAxis.x * eye.x + yAxis.y * eye.y + yAxis.z * eye.z),
    -(zAxis.x * eye.x + zAxis.y * eye.y + zAxis.z * eye.z),
    1,
  ])
}

export const createOrthographicMat4 = (
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Mat4 =>
  new Float32Array([
    2 / (right - left),
    0,
    0,
    0,
    0,
    2 / (top - bottom),
    0,
    0,
    0,
    0,
    -2 / (far - near),
    0,
    -(right + left) / (right - left),
    -(top + bottom) / (top - bottom),
    -(far + near) / (far - near),
    1,
  ])
