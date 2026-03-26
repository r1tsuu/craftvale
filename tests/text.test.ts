import { expect, test } from 'bun:test'

import { buildTextMesh } from '../apps/client/src/render/text-mesh.ts'

test('text mesh emits geometry for supported HUD text', () => {
  const mesh = buildTextMesh('FPS: 60.0', 20, 20, 3, [1, 1, 1])

  expect(mesh.indexCount).toBeGreaterThan(0)
  expect(mesh.vertexData.length % 6).toBe(0)
})

test('text mesh renders slash-prefixed command text', () => {
  const mesh = buildTextMesh('/gamemode 1', 20, 20, 3, [1, 1, 1])
  const slashOnlyMesh = buildTextMesh('/', 20, 20, 3, [1, 1, 1])

  expect(slashOnlyMesh.indexCount).toBeGreaterThan(0)
  expect(mesh.indexCount).toBeGreaterThan(slashOnlyMesh.indexCount)
})

test('text mesh supports every printable ASCII character', () => {
  for (let codepoint = 32; codepoint <= 126; codepoint += 1) {
    const character = String.fromCharCode(codepoint)
    const mesh = buildTextMesh(character, 20, 20, 3, [1, 1, 1])

    if (character === ' ') {
      expect(mesh.indexCount).toBe(0)
      continue
    }

    expect(mesh.indexCount).toBeGreaterThan(0)
  }
})

test('lowercase letters render differently from uppercase letters', () => {
  const lowercaseMesh = buildTextMesh('a', 20, 20, 3, [1, 1, 1])
  const uppercaseMesh = buildTextMesh('A', 20, 20, 3, [1, 1, 1])

  expect(lowercaseMesh.indexCount).toBeGreaterThan(0)
  expect(uppercaseMesh.indexCount).toBeGreaterThan(0)
  expect(Array.from(lowercaseMesh.vertexData)).not.toEqual(Array.from(uppercaseMesh.vertexData))
})
