import {
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { type OverlayVisualTheme } from "@/config/theme";
import {
  MIN_CLICK_REGION_HEIGHT,
  MIN_CLICK_REGION_WIDTH,
  isClickRegionValid,
  normalizeClickRegionToBounds,
} from "@/lib/click-region";
import { withAlpha } from "@/lib/color";
import type { OverlayRect, ScreenPoint } from "@/lib/click-position-overlay";
import { cn } from "@tauri-ui/lib/utils";

type ClickRegionHandle =
  | "draw"
  | "move"
  | "north"
  | "south"
  | "east"
  | "west"
  | "north-east"
  | "north-west"
  | "south-east"
  | "south-west";

type ClickRegionInteraction = {
  pointerId: number;
  handle: ClickRegionHandle;
  startPoint: ScreenPoint;
  startRegion: OverlayRect | null;
};

const HANDLE_SIZE_PX = 7;
const HANDLE_CONTAINER_SIZE_PX = 18;
const REGION_CORNER_RADIUS_PX = 18;
const CORNER_HANDLE_OFFSET_PX =
  REGION_CORNER_RADIUS_PX -
  REGION_CORNER_RADIUS_PX / Math.sqrt(2) -
  HANDLE_CONTAINER_SIZE_PX / 2;
const BOTTOM_CORNER_HANDLE_VERTICAL_NUDGE_PX = 2;
const SIDE_HANDLE_OFFSET_PX = -HANDLE_CONTAINER_SIZE_PX / 2;
const TOP_HANDLE_ALIGNMENT_NUDGE_PX = 0.5;
const LEFT_HANDLE_ALIGNMENT_NUDGE_PX = 0.5;

const HANDLE_CURSOR: Record<Exclude<ClickRegionHandle, "draw" | "move">, string> = {
  north: "ns-resize",
  south: "ns-resize",
  east: "ew-resize",
  west: "ew-resize",
  "north-east": "nesw-resize",
  "south-west": "nesw-resize",
  "north-west": "nwse-resize",
  "south-east": "nwse-resize",
};

function regionRight(region: OverlayRect) {
  return region.x + region.width;
}

function regionBottom(region: OverlayRect) {
  return region.y + region.height;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampScreenPointToBounds(point: ScreenPoint, bounds: OverlayRect): ScreenPoint {
  return {
    x: clamp(point.x, bounds.x, bounds.x + bounds.width),
    y: clamp(point.y, bounds.y, bounds.y + bounds.height),
  };
}

function regionFromDrawPoints(
  startPoint: ScreenPoint,
  currentPoint: ScreenPoint,
  bounds: OverlayRect,
) {
  let left = Math.min(startPoint.x, currentPoint.x);
  let right = Math.max(startPoint.x, currentPoint.x);
  let top = Math.min(startPoint.y, currentPoint.y);
  let bottom = Math.max(startPoint.y, currentPoint.y);

  if (right - left < MIN_CLICK_REGION_WIDTH) {
    if (currentPoint.x >= startPoint.x) {
      right = left + MIN_CLICK_REGION_WIDTH;
    } else {
      left = right - MIN_CLICK_REGION_WIDTH;
    }
  }

  if (bottom - top < MIN_CLICK_REGION_HEIGHT) {
    if (currentPoint.y >= startPoint.y) {
      bottom = top + MIN_CLICK_REGION_HEIGHT;
    } else {
      top = bottom - MIN_CLICK_REGION_HEIGHT;
    }
  }

  return normalizeClickRegionToBounds(
    {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    },
    bounds,
  );
}

function resizeRegion(
  handle: Exclude<ClickRegionHandle, "draw" | "move">,
  startRegion: OverlayRect,
  currentPoint: ScreenPoint,
  bounds: OverlayRect,
) {
  let left = startRegion.x;
  let right = regionRight(startRegion);
  let top = startRegion.y;
  let bottom = regionBottom(startRegion);

  if (handle.includes("west")) {
    left = currentPoint.x;
  }
  if (handle.includes("east")) {
    right = currentPoint.x;
  }
  if (handle.includes("north")) {
    top = currentPoint.y;
  }
  if (handle.includes("south")) {
    bottom = currentPoint.y;
  }

  if (right - left < MIN_CLICK_REGION_WIDTH) {
    if (handle.includes("west")) {
      left = right - MIN_CLICK_REGION_WIDTH;
    } else if (handle.includes("east")) {
      right = left + MIN_CLICK_REGION_WIDTH;
    }
  }

  if (bottom - top < MIN_CLICK_REGION_HEIGHT) {
    if (handle.includes("north")) {
      top = bottom - MIN_CLICK_REGION_HEIGHT;
    } else if (handle.includes("south")) {
      bottom = top + MIN_CLICK_REGION_HEIGHT;
    }
  }

  return normalizeClickRegionToBounds(
    {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    },
    bounds,
  );
}

function moveRegion(
  startRegion: OverlayRect,
  startPoint: ScreenPoint,
  currentPoint: ScreenPoint,
  bounds: OverlayRect,
) {
  return normalizeClickRegionToBounds(
    {
      ...startRegion,
      x: startRegion.x + (currentPoint.x - startPoint.x),
      y: startRegion.y + (currentPoint.y - startPoint.y),
    },
    bounds,
  );
}

type ClickRegionOverlayProps = {
  bounds: OverlayRect;
  editable: boolean;
  onConfirm: () => void;
  onRegionChange: (region: OverlayRect) => void;
  region: OverlayRect | null;
  scaleFactor: number;
  theme: OverlayVisualTheme;
};

export function ClickRegionOverlay({
  bounds,
  editable,
  onConfirm,
  onRegionChange,
  region,
  scaleFactor,
  theme,
}: ClickRegionOverlayProps) {
  const latestRegionRef = useRef<OverlayRect | null>(region);
  const interactionRef = useRef<ClickRegionInteraction | null>(null);

  const displayRegion = useMemo(() => {
    if (!isClickRegionValid(region)) {
      return null;
    }

    return normalizeClickRegionToBounds(region, bounds);
  }, [bounds, region]);

  useEffect(() => {
    latestRegionRef.current = displayRegion;
  }, [displayRegion]);

  useEffect(() => {
    if (!editable) {
      interactionRef.current = null;
      return undefined;
    }

    function pointerToScreenPoint(event: PointerEvent) {
      return clampScreenPointToBounds(
        {
          x: Math.round(bounds.x + event.clientX * scaleFactor),
          y: Math.round(bounds.y + event.clientY * scaleFactor),
        },
        bounds,
      );
    }

    function handlePointerMove(event: PointerEvent) {
      const interaction = interactionRef.current;
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return;
      }

      const currentPoint = pointerToScreenPoint(event);
      let nextRegion: OverlayRect | null = null;

      if (interaction.handle === "draw") {
        nextRegion = regionFromDrawPoints(
          interaction.startPoint,
          currentPoint,
          bounds,
        );
      } else if (interaction.handle === "move") {
        if (!interaction.startRegion) {
          return;
        }

        nextRegion = moveRegion(
          interaction.startRegion,
          interaction.startPoint,
          currentPoint,
          bounds,
        );
      } else {
        if (!interaction.startRegion) {
          return;
        }

        nextRegion = resizeRegion(
          interaction.handle,
          interaction.startRegion,
          currentPoint,
          bounds,
        );
      }

      if (!nextRegion) {
        return;
      }

      latestRegionRef.current = nextRegion;
      onRegionChange(nextRegion);
    }

    function finishInteraction(event: PointerEvent) {
      const interaction = interactionRef.current;
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return;
      }

      interactionRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishInteraction);
    window.addEventListener("pointercancel", finishInteraction);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishInteraction);
      window.removeEventListener("pointercancel", finishInteraction);
    };
  }, [bounds, editable, onRegionChange, scaleFactor]);

  function startInteraction(
    event: ReactPointerEvent<HTMLElement>,
    handle: ClickRegionHandle,
  ) {
    if (!editable) {
      return;
    }

    const startPoint = clampScreenPointToBounds(
      {
        x: Math.round(bounds.x + event.clientX * scaleFactor),
        y: Math.round(bounds.y + event.clientY * scaleFactor),
      },
      bounds,
    );

    event.preventDefault();
    event.stopPropagation();

    interactionRef.current = {
      pointerId: event.pointerId,
      handle,
      startPoint,
      startRegion: latestRegionRef.current,
    };

    if (handle === "draw") {
      const nextRegion = regionFromDrawPoints(startPoint, startPoint, bounds);
      latestRegionRef.current = nextRegion;
      onRegionChange(nextRegion);
    }
  }

  function handleConfirm(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    onConfirm();
  }

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editable) {
      return;
    }

    if (!displayRegion) {
      startInteraction(event, "draw");
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  if (!displayRegion && !editable) {
    return null;
  }

  const borderColor = withAlpha(theme.edgeStopLine, 0.95);
  const fillColor = withAlpha(theme.edgeStopFill, editable ? 0.18 : 0.12);
  const glowColor = withAlpha(theme.edgeStopLine, editable ? 0.32 : 0.18);

  return (
    <>
      {editable ? (
        <div
          className="pointer-events-auto absolute inset-0"
          onPointerDown={handleBackdropPointerDown}
          style={{
            backgroundColor: withAlpha(theme.edgeStopFill, 0.03),
            cursor: displayRegion ? "default" : "crosshair",
          }}
        />
      ) : null}

      {displayRegion ? (
        <div
          className={cn(
            "absolute overflow-visible",
            editable ? "pointer-events-auto" : "pointer-events-none",
          )}
          onPointerDown={(event) => startInteraction(event, "move")}
          style={{
            borderRadius: REGION_CORNER_RADIUS_PX,
            left: (displayRegion.x - bounds.x) / scaleFactor,
            top: (displayRegion.y - bounds.y) / scaleFactor,
            width: displayRegion.width / scaleFactor,
            height: displayRegion.height / scaleFactor,
            backgroundColor: fillColor,
            border: `1px solid ${borderColor}`,
            boxShadow: `0 0 0 1px ${withAlpha(theme.edgeStopLine, 0.14)}, 0 0 28px ${glowColor}`,
            cursor: editable ? "move" : "default",
          }}
        >
          {!editable ? (
            <div className="pointer-events-none absolute top-2 left-2 rounded-md border border-white/12 bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/92">
              Click Region
            </div>
          ) : null}

          {editable ? (
            <button
              className="absolute top-2 right-2 rounded-md border border-white/18 bg-black/72 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/92 transition-colors hover:bg-black/84 focus-visible:outline-none focus-visible:ring-0"
              onClick={handleConfirm}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              type="button"
            >
              Confirm
            </button>
          ) : null}

          {editable
            ? ([
                {
                  handle: "north-west",
                  className: undefined,
                  style: {
                    left: CORNER_HANDLE_OFFSET_PX,
                    top: CORNER_HANDLE_OFFSET_PX,
                  },
                },
                {
                  handle: "north",
                  className: undefined,
                  style: {
                    left: "50%",
                    top: SIDE_HANDLE_OFFSET_PX - TOP_HANDLE_ALIGNMENT_NUDGE_PX,
                    transform: "translateX(-50%)",
                  },
                },
                {
                  handle: "north-east",
                  className: undefined,
                  style: {
                    right: CORNER_HANDLE_OFFSET_PX,
                    top: CORNER_HANDLE_OFFSET_PX,
                  },
                },
                {
                  handle: "east",
                  className: undefined,
                  style: {
                    right: SIDE_HANDLE_OFFSET_PX,
                    top: "50%",
                    transform: "translateY(-50%)",
                  },
                },
                {
                  handle: "south-east",
                  className: undefined,
                  style: {
                    right: CORNER_HANDLE_OFFSET_PX,
                    bottom:
                      CORNER_HANDLE_OFFSET_PX -
                      BOTTOM_CORNER_HANDLE_VERTICAL_NUDGE_PX,
                  },
                },
                {
                  handle: "south",
                  className: undefined,
                  style: {
                    left: "50%",
                    bottom: SIDE_HANDLE_OFFSET_PX,
                    transform: "translateX(-50%)",
                  },
                },
                {
                  handle: "south-west",
                  className: undefined,
                  style: {
                    left: CORNER_HANDLE_OFFSET_PX,
                    bottom:
                      CORNER_HANDLE_OFFSET_PX -
                      BOTTOM_CORNER_HANDLE_VERTICAL_NUDGE_PX,
                  },
                },
                {
                  handle: "west",
                  className: undefined,
                  style: {
                    left: SIDE_HANDLE_OFFSET_PX - LEFT_HANDLE_ALIGNMENT_NUDGE_PX,
                    top: "50%",
                    transform: "translateY(-50%)",
                  },
                },
              ] as const).map(({ handle, className, style }) => (
                <button
                  className={cn(
                    "absolute rounded-full border-0 bg-transparent shadow-none focus-visible:outline-none focus-visible:ring-0",
                    className,
                  )}
                  key={handle}
                  onPointerDown={(event) => startInteraction(event, handle)}
                  style={{
                    width: HANDLE_CONTAINER_SIZE_PX,
                    height: HANDLE_CONTAINER_SIZE_PX,
                    cursor: HANDLE_CURSOR[handle],
                    ...style,
                  }}
                  type="button"
                >
                  <span
                    className="pointer-events-none absolute rounded-full bg-white"
                    style={{
                      width: HANDLE_SIZE_PX,
                      height: HANDLE_SIZE_PX,
                      left: (HANDLE_CONTAINER_SIZE_PX - HANDLE_SIZE_PX) / 2,
                      top: (HANDLE_CONTAINER_SIZE_PX - HANDLE_SIZE_PX) / 2,
                    }}
                  />
                </button>
              ))
            : null}
        </div>
      ) : null}
    </>
  );
}
