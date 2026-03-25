import type { UiRect } from "./components.ts";

export interface UiInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type UiPadding = number | Partial<UiInsets>;
export type UiAlign = "start" | "center" | "end" | "stretch";

export interface StackYItemSize {
  width?: number;
  height: number;
}

export interface StackXItemSize {
  width?: number;
  height?: number;
}

const normalizeInsets = (padding: UiPadding): UiInsets => {
  if (typeof padding === "number") {
    return {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding,
    };
  }

  return {
    top: padding.top ?? 0,
    right: padding.right ?? 0,
    bottom: padding.bottom ?? 0,
    left: padding.left ?? 0,
  };
};

const resolveAlignedX = (container: UiRect, width: number, align: UiAlign): number => {
  if (align === "center") {
    return container.x + (container.width - width) / 2;
  }

  if (align === "end") {
    return container.x + container.width - width;
  }

  return container.x;
};

export const centerRect = (
  container: UiRect,
  width: number,
  height: number,
): UiRect => ({
  x: Math.round(container.x + (container.width - width) / 2),
  y: Math.round(container.y + (container.height - height) / 2),
  width,
  height,
});

export const insetRect = (rect: UiRect, padding: UiPadding): UiRect => {
  const insets = normalizeInsets(padding);

  return {
    x: rect.x + insets.left,
    y: rect.y + insets.top,
    width: Math.max(0, rect.width - insets.left - insets.right),
    height: Math.max(0, rect.height - insets.top - insets.bottom),
  };
};

export const stackY = (
  container: UiRect,
  items: readonly StackYItemSize[],
  gap: number,
  align: UiAlign = "stretch",
): UiRect[] => {
  let currentY = container.y;

  return items.map((item) => {
    const width = align === "stretch" ? container.width : Math.min(item.width ?? container.width, container.width);
    const rect = {
      x: Math.round(resolveAlignedX(container, width, align)),
      y: Math.round(currentY),
      width: Math.round(width),
      height: Math.round(item.height),
    };

    currentY += item.height + gap;
    return rect;
  });
};

export const stackX = (
  container: UiRect,
  items: readonly StackXItemSize[],
  gap: number,
): UiRect[] => {
  const totalGap = Math.max(0, items.length - 1) * gap;
  const fixedWidth = items.reduce((sum, item) => sum + (item.width ?? 0), 0);
  const autoCount = items.filter((item) => item.width === undefined).length;
  const remainingWidth = Math.max(0, container.width - totalGap - fixedWidth);
  let autoWidthRemainder = remainingWidth;
  let autoItemsRemaining = autoCount;
  let currentX = container.x;

  return items.map((item) => {
    let width = item.width ?? 0;
    if (item.width === undefined) {
      width = autoItemsRemaining <= 1 ? autoWidthRemainder : Math.floor(autoWidthRemainder / autoItemsRemaining);
      autoWidthRemainder -= width;
      autoItemsRemaining -= 1;
    }

    const rect = {
      x: Math.round(currentX),
      y: container.y,
      width: Math.round(width),
      height: Math.round(item.height ?? container.height),
    };

    currentX += width + gap;
    return rect;
  });
};
