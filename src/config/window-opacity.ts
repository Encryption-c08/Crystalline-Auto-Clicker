export const MIN_WINDOW_OPACITY_PERCENT = 40;
export const MAX_WINDOW_OPACITY_PERCENT = 100;
export const DEFAULT_WINDOW_OPACITY_PERCENT = 100;

export function normalizeWindowOpacityPercent(
  value: number | null | undefined,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WINDOW_OPACITY_PERCENT;
  }

  return Math.min(
    MAX_WINDOW_OPACITY_PERCENT,
    Math.max(MIN_WINDOW_OPACITY_PERCENT, Math.round(value)),
  );
}
