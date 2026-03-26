import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { buildGeneratedContentArtifacts } from '../apps/cli/src/content-registry-generator.ts'
import { BLOCK_IDS } from '../packages/core/src/world/blocks.ts'
import { ITEM_IDS } from '../packages/core/src/world/items.ts'

const GENERATED_IDS_PATH = join(
  import.meta.dir,
  '..',
  'packages',
  'core',
  'src',
  'world',
  'generated',
  'content-ids.ts',
)
const GENERATED_REGISTRY_PATH = join(
  import.meta.dir,
  '..',
  'packages',
  'core',
  'src',
  'world',
  'generated',
  'content-registry.ts',
)

test('generated content registry artifacts stay in sync with authored content', async () => {
  const artifacts = await buildGeneratedContentArtifacts()

  await expect(readFile(GENERATED_IDS_PATH, 'utf8')).resolves.toBe(artifacts.contentIdsSource)
  await expect(readFile(GENERATED_REGISTRY_PATH, 'utf8')).resolves.toBe(
    artifacts.contentRegistrySource,
  )
})

test('generated ids preserve the current block and item assignments', () => {
  expect(BLOCK_IDS.air).toBe(0)
  expect(BLOCK_IDS.bedrock).toBe(10)
  expect(BLOCK_IDS.glowstone).toBe(11)
  expect(BLOCK_IDS.water).toBe(12)
  expect(BLOCK_IDS.coalOre).toBe(13)
  expect(BLOCK_IDS.ironOre).toBe(14)
  expect(BLOCK_IDS.goldOre).toBe(15)
  expect(BLOCK_IDS.diamondOre).toBe(16)
  expect(ITEM_IDS.empty).toBe(0)
  expect(ITEM_IDS.grass).toBe(101)
  expect(ITEM_IDS.glowstone).toBe(110)
  expect(ITEM_IDS.coalOre).toBe(111)
  expect(ITEM_IDS.ironOre).toBe(112)
  expect(ITEM_IDS.goldOre).toBe(113)
  expect(ITEM_IDS.diamondOre).toBe(114)
})
