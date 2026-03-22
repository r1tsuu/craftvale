import { expect, test } from "bun:test";
import { createButton, evaluateUi } from "../src/ui/components.ts";

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
