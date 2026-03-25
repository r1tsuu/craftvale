import { expect, test } from "bun:test";
import { ClientWorldRuntime } from "../apps/client/src/client/world-runtime.ts";
import type { IClientAdapter } from "../apps/client/src/client/client-adapter.ts";
import { LIGHT_LEVEL_MAX, raycastVoxel, vec3 } from "@craftvale/core/shared";

const createClientRuntime = (): ClientWorldRuntime =>
  new ClientWorldRuntime({
    eventBus: {
      send: () => Promise.resolve(undefined),
    },
    close: () => {},
  } as unknown as IClientAdapter);

test("predicted breaks advance the next client raycast immediately", () => {
  const runtime = createClientRuntime();
  runtime.world.setBlock(2, 2, 2, 3);
  runtime.world.setBlock(3, 2, 2, 3);

  const initialHit = raycastVoxel(runtime.world, vec3(0.5, 2.5, 2.5), vec3(1, 0, 0), 10);
  expect(initialHit?.hit).toEqual({ x: 2, y: 2, z: 2 });

  expect(runtime.applyPredictedBreak(2, 2, 2, 0)).toBe(true);

  const nextHit = raycastVoxel(runtime.world, vec3(0.5, 2.5, 2.5), vec3(1, 0, 0), 10);
  expect(nextHit?.hit).toEqual({ x: 3, y: 2, z: 2 });
});

test("predicted breaks respect survival-only unbreakable blocks", () => {
  const runtime = createClientRuntime();
  runtime.world.setBlock(2, 2, 2, 10);

  expect(runtime.applyPredictedBreak(2, 2, 2, 0)).toBe(false);
  expect(runtime.world.getBlock(2, 2, 2)).toBe(10);

  expect(runtime.applyPredictedBreak(2, 2, 2, 1)).toBe(true);
  expect(runtime.world.getBlock(2, 2, 2)).toBe(0);
});

test("predicted breaks refresh the exposed cell lighting immediately", () => {
  const runtime = createClientRuntime();
  runtime.world.setBlock(2, 2, 2, 3);
  runtime.world.setLighting(2, 3, 2, LIGHT_LEVEL_MAX, 0);

  expect(runtime.applyPredictedBreak(2, 2, 2, 0)).toBe(true);
  expect(runtime.world.getSkyLight(2, 2, 2)).toBe(LIGHT_LEVEL_MAX);
});
