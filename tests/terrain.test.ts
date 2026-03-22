import { expect, test } from "bun:test";
import { createGeneratedChunk, getTerrainHeight } from "../src/world/terrain.ts";

test("terrain remains locally smooth between adjacent columns", () => {
  const seed = 123456789;

  for (let z = -16; z < 16; z += 1) {
    for (let x = -16; x < 16; x += 1) {
      const center = getTerrainHeight(seed, x, z);
      const right = getTerrainHeight(seed, x + 1, z);
      const forward = getTerrainHeight(seed, x, z + 1);

      expect(Math.abs(center - right)).toBeLessThanOrEqual(2);
      expect(Math.abs(center - forward)).toBeLessThanOrEqual(2);
    }
  }
});

test("different seeds still produce different terrain samples", () => {
  const samplesA: number[] = [];
  const samplesB: number[] = [];

  for (let index = 0; index < 8; index += 1) {
    samplesA.push(getTerrainHeight(111, 24 + index * 3, -13 + index * 2));
    samplesB.push(getTerrainHeight(222, 24 + index * 3, -13 + index * 2));
  }

  expect(samplesA).not.toEqual(samplesB);
});

test("generated trees are deterministic for a fixed seed and chunk", () => {
  const chunkA = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42);
  const chunkB = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42);

  expect(chunkA.blocks).toEqual(chunkB.blocks);

  let logs = 0;
  let leaves = 0;
  for (const blockId of chunkA.blocks) {
    if (blockId === 4) logs += 1;
    if (blockId === 5) leaves += 1;
  }

  expect(logs).toBeGreaterThan(0);
  expect(leaves).toBeGreaterThan(0);
});

test("tree trunks start above grass surface blocks", () => {
  const chunk = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42);
  let trunkBases = 0;

  for (let y = 1; y < 16; y += 1) {
    for (let z = 0; z < 16; z += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (chunk.get(x, y, z) === 4 && chunk.get(x, y - 1, z) === 1) {
          trunkBases += 1;
        }
      }
    }
  }

  expect(trunkBases).toBeGreaterThan(0);
});

test("tree canopies remain consistent across chunk borders", () => {
  const left = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42);
  const right = createGeneratedChunk({ x: 1, y: 0, z: 0 }, 42);

  expect(left.get(15, 11, 7)).toBe(5);
  expect(right.get(0, 11, 7)).toBe(5);
  expect(left.get(15, 11, 8)).toBe(4);
  expect(right.get(0, 11, 8)).toBe(5);
});

test("different seeds produce different tree layouts", () => {
  const chunkA = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 42);
  const chunkB = createGeneratedChunk({ x: 0, y: 0, z: 0 }, 43);
  const treeBlocksA: number[] = [];
  const treeBlocksB: number[] = [];

  for (let index = 0; index < chunkA.blocks.length; index += 1) {
    const blockA = chunkA.blocks[index];
    const blockB = chunkB.blocks[index];
    if (blockA === 4 || blockA === 5) {
      treeBlocksA.push(index, blockA);
    }
    if (blockB === 4 || blockB === 5) {
      treeBlocksB.push(index, blockB);
    }
  }

  expect(treeBlocksA).not.toEqual(treeBlocksB);
});
