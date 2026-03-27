import { expect, test } from 'bun:test'

import { buildFocusHighlightMesh } from '../apps/client/src/render/highlight-mesh.ts'

test('focus highlight mesh creates a full voxel edge box', () => {
  const mesh = buildFocusHighlightMesh({ x: 2, y: 3, z: 4 })

  expect(mesh.vertexData.length).toBe(8 * 6)
  expect(mesh.indexData.length).toBe(12 * 2)
  expect(mesh.vertexData[0]).toBeLessThan(2)
  expect(mesh.vertexData[6]).toBeGreaterThan(2.9)
})

test('focus highlight mesh is white at zero break progress', () => {
  const mesh = buildFocusHighlightMesh({ x: 0, y: 0, z: 0 }, 0)
  // color components at offsets 3, 4, 5 of the first vertex (stride = 6 floats)
  expect(mesh.vertexData[3]).toBeCloseTo(0.97)
  expect(mesh.vertexData[4]).toBeCloseTo(0.97)
  expect(mesh.vertexData[5]).toBeCloseTo(0.97)
})

test('focus highlight mesh shifts toward red at full break progress', () => {
  const mesh = buildFocusHighlightMesh({ x: 0, y: 0, z: 0 }, 1)
  expect(mesh.vertexData[3]).toBeCloseTo(1.0)
  expect(mesh.vertexData[4]).toBeCloseTo(0.15)
  expect(mesh.vertexData[5]).toBeCloseTo(0.1)
})

test('focus highlight mesh is amber at 50% break progress', () => {
  const mesh = buildFocusHighlightMesh({ x: 0, y: 0, z: 0 }, 0.5)
  expect(mesh.vertexData[3]).toBeGreaterThan(0.97)
  expect(mesh.vertexData[4]).toBeCloseTo(0.65)
})
