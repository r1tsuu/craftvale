import { RectOverlayRenderer, type RectDrawCommand } from "../render/rect.ts";
import { TextOverlayRenderer, type TextDrawCommand } from "../render/text.ts";
import { measureTextHeight, measureTextWidth } from "../render/text-mesh.ts";
import { NativeBridge } from "../platform/native.ts";
import type { UiResolvedComponent } from "./components.ts";

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

      const baseColor: readonly [number, number, number] = component.hovered
        ? [0.46, 0.67, 0.84]
        : [0.27, 0.43, 0.58];
      rects.push({
        ...component.rect,
        color: [0.08, 0.12, 0.16],
      });
      rects.push({
        x: component.rect.x + 3,
        y: component.rect.y + 3,
        width: component.rect.width - 6,
        height: component.rect.height - 6,
        color: baseColor,
      });

      text.push(this.toTextCommand(component.text, component.rect, component.scale, [0.98, 0.98, 0.98], true));
    }

    this.rectRenderer.render(rects, width, height);
    this.textRenderer.render(text, width, height);
  }

  private toTextCommand(
    text: string,
    rect: { x: number; y: number; width: number; height: number },
    scale: number,
    color: readonly [number, number, number],
    centered = false,
  ): TextDrawCommand {
    const textWidth = measureTextWidth(text, scale);
    const textHeight = measureTextHeight(scale);
    const x = centered ? rect.x + Math.round((rect.width - textWidth) / 2) : rect.x;
    const y = rect.y + Math.round((rect.height - textHeight) / 2);

    return {
      text,
      x,
      y,
      scale,
      color,
      shadowColor: [0.05, 0.06, 0.08],
      shadowOffset: { x: 1, y: 1 },
    };
  }
}
