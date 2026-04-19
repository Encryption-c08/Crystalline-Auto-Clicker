import type { ClickPositionOverlayState, OverlayRect } from "@/lib/click-position-overlay";
import type { ClickRegion } from "@/config/settings";

export const DEFAULT_CLICK_REGION_WIDTH = 320;
export const DEFAULT_CLICK_REGION_HEIGHT = 220;
export const MIN_CLICK_REGION_WIDTH = 96;
export const MIN_CLICK_REGION_HEIGHT = 34;
const CLICK_REGION_SCREEN_MARGIN = 48;

export function isClickRegionValid(
  region: ClickRegion | OverlayRect | null | undefined,
): region is ClickRegion {
  return Boolean(
    region &&
      Number.isFinite(region.x) &&
      Number.isFinite(region.y) &&
      Number.isFinite(region.width) &&
      Number.isFinite(region.height) &&
      region.width > 0 &&
      region.height > 0,
  );
}

export function resolveOverlayBounds(
  overlayState:
    | Pick<ClickPositionOverlayState, "height" | "originX" | "originY" | "width">
    | null
    | undefined,
): OverlayRect {
  const fallbackWidth =
    typeof window === "undefined" ? 1 : Math.max(1, window.screen.availWidth || 1);
  const fallbackHeight =
    typeof window === "undefined" ? 1 : Math.max(1, window.screen.availHeight || 1);

  return {
    x: overlayState?.originX ?? 0,
    y: overlayState?.originY ?? 0,
    width: Math.max(1, overlayState?.width || fallbackWidth),
    height: Math.max(1, overlayState?.height || fallbackHeight),
  };
}

export function createDefaultClickRegion(bounds: OverlayRect): ClickRegion {
  const availableWidth = Math.max(
    MIN_CLICK_REGION_WIDTH,
    bounds.width - CLICK_REGION_SCREEN_MARGIN * 2,
  );
  const availableHeight = Math.max(
    MIN_CLICK_REGION_HEIGHT,
    bounds.height - CLICK_REGION_SCREEN_MARGIN * 2,
  );
  const width = Math.min(DEFAULT_CLICK_REGION_WIDTH, availableWidth);
  const height = Math.min(DEFAULT_CLICK_REGION_HEIGHT, availableHeight);

  return {
    x: bounds.x + Math.round((bounds.width - width) / 2),
    y: bounds.y + Math.round((bounds.height - height) / 2),
    width,
    height,
  };
}

export function normalizeClickRegionToBounds(
  region: ClickRegion | OverlayRect,
  bounds: OverlayRect,
): ClickRegion {
  const maxWidth = Math.max(MIN_CLICK_REGION_WIDTH, bounds.width);
  const maxHeight = Math.max(MIN_CLICK_REGION_HEIGHT, bounds.height);
  const width = Math.min(
    maxWidth,
    Math.max(MIN_CLICK_REGION_WIDTH, Math.round(region.width)),
  );
  const height = Math.min(
    maxHeight,
    Math.max(MIN_CLICK_REGION_HEIGHT, Math.round(region.height)),
  );
  const minX = bounds.x;
  const minY = bounds.y;
  const maxX = bounds.x + bounds.width - width;
  const maxY = bounds.y + bounds.height - height;

  return {
    x: clamp(Math.round(region.x), minX, Math.max(minX, maxX)),
    y: clamp(Math.round(region.y), minY, Math.max(minY, maxY)),
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
