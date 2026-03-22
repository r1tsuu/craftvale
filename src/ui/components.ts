export interface UiRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiPointerState {
  x: number;
  y: number;
  primaryDown: boolean;
  primaryPressed: boolean;
}

interface UiBaseComponent {
  id: string;
  rect: UiRect;
}

export interface UiPanel extends UiBaseComponent {
  kind: "panel";
  color: readonly [number, number, number];
}

export interface UiLabel extends UiBaseComponent {
  kind: "label";
  text: string;
  scale: number;
  color: readonly [number, number, number];
  centered?: boolean;
}

export interface UiButton extends UiBaseComponent {
  kind: "button";
  text: string;
  action: string;
  scale: number;
}

export type UiComponent = UiPanel | UiLabel | UiButton;

export interface UiResolvedButton extends UiButton {
  hovered: boolean;
}

export type UiResolvedComponent = UiPanel | UiLabel | UiResolvedButton;

export interface UiEvaluationResult {
  components: UiResolvedComponent[];
  actions: string[];
}

export const createPanel = (panel: UiPanel): UiPanel => panel;
export const createLabel = (label: UiLabel): UiLabel => label;
export const createButton = (button: UiButton): UiButton => button;

export const containsPoint = (rect: UiRect, x: number, y: number): boolean =>
  x >= rect.x &&
  x <= rect.x + rect.width &&
  y >= rect.y &&
  y <= rect.y + rect.height;

export const evaluateUi = (
  components: readonly UiComponent[],
  pointer: UiPointerState,
): UiEvaluationResult => {
  const resolved: UiResolvedComponent[] = [];
  const actions: string[] = [];

  for (const component of components) {
    if (component.kind !== "button") {
      resolved.push(component);
      continue;
    }

    const hovered = containsPoint(component.rect, pointer.x, pointer.y);
    if (hovered && pointer.primaryPressed) {
      actions.push(component.action);
    }

    resolved.push({
      ...component,
      hovered,
    });
  }

  return {
    components: resolved,
    actions,
  };
};
