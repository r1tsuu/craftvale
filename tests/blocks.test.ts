import { expect, test } from 'bun:test'

import { BLOCK_IDS, getBlockDurability } from '../packages/core/src/world/blocks.ts'

test('getBlockDurability returns 0 for air', () => {
  expect(getBlockDurability(BLOCK_IDS.air)).toBe(0)
})

test('getBlockDurability returns 0 for unbreakable blocks', () => {
  expect(getBlockDurability(BLOCK_IDS.bedrock)).toBe(0)
})

test('getBlockDurability returns a positive value for soft breakable blocks', () => {
  expect(getBlockDurability(BLOCK_IDS.grass)).toBeGreaterThan(0)
  expect(getBlockDurability(BLOCK_IDS.dirt)).toBeGreaterThan(0)
})

test('stone has higher durability than dirt', () => {
  expect(getBlockDurability(BLOCK_IDS.stone)).toBeGreaterThan(getBlockDurability(BLOCK_IDS.dirt))
})

test('ore blocks have higher durability than stone', () => {
  expect(getBlockDurability(BLOCK_IDS.coalOre)).toBeGreaterThan(getBlockDurability(BLOCK_IDS.stone))
})
