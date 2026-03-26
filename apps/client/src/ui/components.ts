import type { ItemId } from "@craftvale/core/shared";

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

export interface UiItem extends UiBaseComponent {
  kind: "item";
  itemId: ItemId;
}

export interface UiHotspot extends UiBaseComponent {
  kind: "hotspot";
  action: string;
  disabled?: boolean;
}

export interface UiSlider extends UiBaseComponent {
  kind: "slider";
  action: string;
  value: number;
  min: number;
  max: number;
  step?: number;
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

export type UiComponent = UiPanel | UiLabel | UiItem | UiButton | UiHotspot | UiSlider;

export interface UiResolvedButton extends UiButton {
  hovered: boolean;
}

export interface UiResolvedHotspot extends UiHotspot {
  hovered: boolean;
}

export interface UiResolvedSlider extends UiSlider {
  hovered: boolean;
  dragging: boolean;
  normalizedValue: number;
}

export interface UiSliderChange {
  action: string;
  value: number;
}

export type UiResolvedComponent =
  | UiPanel
  | UiLabel
  | UiItem
  | UiResolvedButton
  | UiResolvedHotspot
  | UiResolvedSlider;

export interface UiEvaluationResult {
  components: UiResolvedComponent[];
  actions: string[];
  sliderChanges: UiSliderChange[];
}

export const createPanel = (panel: UiPanel): UiPanel => panel;
export const createLabel = (label: UiLabel): UiLabel => label;
export const createItem = (item: UiItem): UiItem => item;
export const createButton = (button: UiButton): UiButton => button;
export const createHotspot = (hotspot: UiHotspot): UiHotspot => hotspot;
export const createSlider = (slider: UiSlider): UiSlider => slider;

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
  const sliderChanges: UiSliderChange[] = [];

  for (const component of components) {
    if (
      component.kind === "panel"
      || component.kind === "label"
      || component.kind === "item"
    ) {
      resolved.push(component);
      continue;
    }

    const hovered = !component.disabled && containsPoint(component.rect, pointer.x, pointer.y);

    if (component.kind === "slider") {
      const range = Math.max(component.max - component.min, 0.0001);
      const normalizedValue = Math.max(
        0,
        Math.min(1, (component.value - component.min) / range),
      );
      const dragging = hovered && pointer.primaryDown;
      if (dragging) {
        const pointerNormalized = Math.max(
          0,
          Math.min(1, (pointer.x - component.rect.x) / Math.max(component.rect.width, 1)),
        );
        const steppedRange = range / Math.max(component.step ?? 1, 0.0001);
        const nextValue = component.min
          + Math.round(pointerNormalized * steppedRange) * (component.step ?? 1);
        sliderChanges.push({
          action: component.action,
          value: Math.max(component.min, Math.min(component.max, nextValue)),
        });
      }

      resolved.push({
        ...component,
        hovered,
        dragging,
        normalizedValue,
      });
      continue;
    }

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
    sliderChanges,
  };
};
