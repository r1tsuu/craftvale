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
  color: readonly [number, number, number, number?];
}

export interface UiLabel extends UiBaseComponent {
  kind: "label";
  text: string;
  scale: number;
  color: readonly [number, number, number, number?];
  centered?: boolean;
}

export interface UiHotspot extends UiBaseComponent {
  kind: "hotspot";
  action: string;
  disabled?: boolean;
}

export type UiButtonVariant = "primary" | "secondary" | "danger";

export interface UiButton extends UiBaseComponent {
  kind: "button";
  text: string;
  action: string;
  scale: number;
  variant?: UiButtonVariant;
  disabled?: boolean;
}

export type UiComponent = UiPanel | UiLabel | UiButton | UiHotspot;

export interface UiResolvedButton extends UiButton {
  hovered: boolean;
}

export interface UiResolvedHotspot extends UiHotspot {
  hovered: boolean;
}

export type UiResolvedComponent = UiPanel | UiLabel | UiResolvedButton | UiResolvedHotspot;

export interface UiEvaluationResult {
  components: UiResolvedComponent[];
  actions: string[];
}

export const createPanel = (panel: UiPanel): UiPanel => panel;
export const createLabel = (label: UiLabel): UiLabel => label;
export const createButton = (button: UiButton): UiButton => button;
export const createHotspot = (hotspot: UiHotspot): UiHotspot => hotspot;

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
    if (component.kind === "panel" || component.kind === "label") {
      resolved.push(component);
      continue;
    }

    const hovered = !component.disabled && containsPoint(component.rect, pointer.x, pointer.y);
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
