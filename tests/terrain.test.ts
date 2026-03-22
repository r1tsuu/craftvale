import { expect, test } from "bun:test";
import { getTerrainHeight } from "../src/world/terrain.ts";

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
