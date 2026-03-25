import { expect, test } from "bun:test";
import { createButton, createSlider, evaluateUi } from "../apps/client/src/ui/components.ts";

test("button triggers action when primary press lands inside bounds", () => {
  const button = createButton({
    id: "start",
    kind: "button",
    rect: { x: 100, y: 100, width: 200, height: 50 },
    text: "START",
    action: "start-game",
    scale: 3,
  });

  const evaluation = evaluateUi([button], {
    x: 150,
    y: 120,
    primaryDown: true,
    primaryPressed: true,
  });

  expect(evaluation.actions).toEqual(["start-game"]);
  expect(evaluation.components[0]).toMatchObject({ hovered: true });
});

test("button does not trigger action when pointer is outside", () => {
  const button = createButton({
    id: "quit",
    kind: "button",
    rect: { x: 100, y: 100, width: 200, height: 50 },
    text: "QUIT",
    action: "quit-game",
    scale: 3,
  });

  const evaluation = evaluateUi([button], {
    x: 10,
    y: 10,
    primaryDown: true,
    primaryPressed: true,
  });

  expect(evaluation.actions).toEqual([]);
  expect(evaluation.components[0]).toMatchObject({ hovered: false });
});

test("disabled button ignores hover and clicks", () => {
  const button = createButton({
    id: "delete",
    kind: "button",
    rect: { x: 100, y: 100, width: 200, height: 50 },
    text: "DELETE",
    action: "delete-world",
    scale: 3,
    disabled: true,
  });

  const evaluation = evaluateUi([button], {
    x: 150,
    y: 120,
    primaryDown: true,
    primaryPressed: true,
  });

  expect(evaluation.actions).toEqual([]);
  expect(evaluation.components[0]).toMatchObject({ hovered: false, disabled: true });
});

test("slider emits a snapped value when clicked on the track", () => {
  const slider = createSlider({
    id: "fov",
    kind: "slider",
    rect: { x: 100, y: 100, width: 200, height: 24 },
    action: "set-setting:fovDegrees",
    value: 70,
    min: 50,
    max: 110,
    step: 10,
  });

  const evaluation = evaluateUi([slider], {
    x: 250,
    y: 110,
    primaryDown: true,
    primaryPressed: true,
  });

  expect(evaluation.actions).toEqual([]);
  expect(evaluation.sliderChanges).toEqual([
    { action: "set-setting:fovDegrees", value: 100 },
  ]);
  expect(evaluation.components[0]).toMatchObject({
    hovered: true,
    dragging: true,
  });
});

test("slider clamps values at the min and max edges", () => {
  const slider = createSlider({
    id: "render-distance",
    kind: "slider",
    rect: { x: 100, y: 100, width: 180, height: 24 },
    action: "set-setting:renderDistance",
    value: 4,
    min: 2,
    max: 8,
    step: 1,
  });

  const lowEvaluation = evaluateUi([slider], {
    x: 40,
    y: 110,
    primaryDown: true,
    primaryPressed: true,
  });
  const highEvaluation = evaluateUi([slider], {
    x: 320,
    y: 110,
    primaryDown: true,
    primaryPressed: true,
  });

  expect(lowEvaluation.sliderChanges).toEqual([]);
  expect(highEvaluation.sliderChanges).toEqual([]);

  const insideLowEvaluation = evaluateUi([slider], {
    x: 100,
    y: 110,
    primaryDown: true,
    primaryPressed: true,
  });
  const insideHighEvaluation = evaluateUi([slider], {
    x: 280,
    y: 110,
    primaryDown: true,
    primaryPressed: true,
  });

  expect(insideLowEvaluation.sliderChanges).toEqual([
    { action: "set-setting:renderDistance", value: 2 },
  ]);
  expect(insideHighEvaluation.sliderChanges).toEqual([
    { action: "set-setting:renderDistance", value: 8 },
  ]);
});
