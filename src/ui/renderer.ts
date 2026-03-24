import { RectOverlayRenderer, type RectDrawCommand } from "../render/rect.ts";
import { TextOverlayRenderer, type TextDrawCommand } from "../render/text.ts";
import { measureTextHeight, measureTextWidth } from "../render/text-mesh.ts";
import { NativeBridge } from "../platform/native.ts";
import type {
  UiButtonVariant,
  UiResolvedComponent,
} from "./components.ts";

interface ButtonPalette {
  outer: readonly [number, number, number, number?];
  inner: readonly [number, number, number, number?];
  text: readonly [number, number, number, number?];
}

const getButtonPalette = (
  variant: UiButtonVariant,
  hovered: boolean,
  disabled: boolean,
): ButtonPalette => {
  if (disabled) {
    return {
      outer: [0.18, 0.2, 0.22],
      inner: [0.32, 0.34, 0.36],
      text: [0.72, 0.74, 0.76],
    };
  }

  if (variant === "danger") {
    return hovered
      ? {
          outer: [0.23, 0.08, 0.07],
          inner: [0.75, 0.28, 0.2],
          text: [0.99, 0.96, 0.93],
        }
      : {
          outer: [0.18, 0.07, 0.07],
          inner: [0.58, 0.2, 0.17],
          text: [0.97, 0.94, 0.91],
        };
  }

  if (variant === "secondary") {
    return hovered
      ? {
          outer: [0.17, 0.18, 0.19],
          inner: [0.66, 0.68, 0.72],
          text: [0.98, 0.98, 0.98],
        }
      : {
          outer: [0.13, 0.14, 0.15],
          inner: [0.48, 0.5, 0.53],
          text: [0.96, 0.96, 0.96],
        };
  }

  return hovered
    ? {
        outer: [0.18, 0.19, 0.12],
        inner: [0.78, 0.8, 0.34],
        text: [0.17, 0.14, 0.05],
      }
    : {
        outer: [0.16, 0.17, 0.11],
        inner: [0.63, 0.65, 0.28],
        text: [0.12, 0.11, 0.04],
      };
};

export class UiRenderer {
  private readonly rectRenderer: RectOverlayRenderer;
  private readonly textRenderer: TextOverlayRenderer;

  public constructor(nativeBridge: NativeBridge) {
    this.rectRenderer = new RectOverlayRenderer(nativeBridge);
    this.textRenderer = new TextOverlayRenderer(nativeBridge);
  }

  public render(components: readonly UiResolvedComponent[], width: number, height: number): void {
    const rects: RectDrawCommand[] = [];
    const text: TextDrawCommand[] = [];

    for (const component of components) {
      if (component.kind === "panel") {
        rects.push({
          ...component.rect,
          color: component.color,
        });
        continue;
      }

      if (component.kind === "label") {
        text.push(this.toTextCommand(component.text, component.rect, component.scale, component.color, component.centered));
        continue;
      }

      if (component.kind === "hotspot") {
        continue;
      }

      const palette = getButtonPalette(
        component.variant ?? "primary",
        component.hovered,
        component.disabled ?? false,
      );
      rects.push({
        ...component.rect,
        color: palette.outer,
      });
      rects.push({
        x: component.rect.x + 3,
        y: component.rect.y + 3,
        width: component.rect.width - 6,
        height: component.rect.height - 6,
        color: palette.inner,
      });

      text.push(this.toTextCommand(component.text, component.rect, component.scale, palette.text, true));
    }

    this.rectRenderer.render(rects, width, height);
    this.textRenderer.render(text, width, height);
  }

  private toTextCommand(
    text: string,
    rect: { x: number; y: number; width: number; height: number },
    scale: number,
    color: readonly [number, number, number, number?],
    centered = false,
  ): TextDrawCommand {
    const textWidth = measureTextWidth(text, scale);
    const textHeight = measureTextHeight(scale);
    const x = centered ? rect.x + Math.round((rect.width - textWidth) / 2) : rect.x;
    const y = rect.y + Math.round((rect.height - textHeight) / 2);
    const alpha = color[3] ?? 1;

    return {
      text,
      x,
      y,
      scale,
      color,
      shadowColor: [0.05, 0.06, 0.08, Math.min(0.9, alpha * 0.85)],
      shadowOffset: { x: 1, y: 1 },
    };
  }
}
