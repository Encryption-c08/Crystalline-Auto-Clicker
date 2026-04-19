import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { emitTo, listen } from "@tauri-apps/api/event";

import { type ClickPosition } from "@/config/settings";
import {
  CLICK_POSITION_OVERLAY_REGION_CANCEL_EVENT,
  CLICK_POSITION_OVERLAY_MOVE_EVENT,
  CLICK_POSITION_OVERLAY_REGION_CONFIRM_EVENT,
  CLICK_POSITION_OVERLAY_UPDATE_EVENT,
  type ClickPositionOverlayRegionCancelEvent,
  type ClickPositionOverlayMoveEvent,
  type ClickPositionOverlayRegionConfirmEvent,
  type ClickPositionOverlayState,
  emptyClickPositionOverlayState,
  getClickPositionOverlayState,
  getCurrentCursorPosition,
  setClickPositionOverlayInteractive,
} from "@/lib/click-position-overlay";
import { isClickRegionValid } from "@/lib/click-region";
import { withAlpha } from "@/lib/color";
import { isTauri } from "@/lib/tauri";
import { ClickRegionOverlay } from "@/overlay/click-region-overlay";
import { UniversalEdgeStopOverlay } from "@/overlay/edge-stop-overlay";
import { UniversalEdgeStopTouchBloom } from "@/overlay/edge-stop-touch-bloom";
import { useEdgeStopTouchFeedback } from "@/overlay/use-edge-stop-touch-feedback";
import { cn } from "@tauri-ui/lib/utils";

const DOT_HIT_RADIUS = 22;
const DOT_HOVER_STICKY_RADIUS = 34;
const CURSOR_POLL_MS = 20;
const CURSOR_PICKER_OFFSET_X = 18;
const CURSOR_PICKER_OFFSET_Y = 24;
const CLICK_POSITION_MARKER_BACKGROUND =
  "radial-gradient(circle at center, rgba(0,0,0,0) 0 34%, rgba(255,255,255,0.96) 34% 58%, rgba(10,10,10,0.96) 58% 100%)";

function findNearbyDotId(
  x: number,
  y: number,
  positions: ClickPosition[],
  preferredId: number | null,
) {
  let nearestId: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let preferredDistance = Number.POSITIVE_INFINITY;

  for (const position of positions) {
    const deltaX = position.x - x;
    const deltaY = position.y - y;
    const distance = Math.hypot(deltaX, deltaY);
    if (position.id === preferredId) {
      preferredDistance = distance;
    }

    if (distance <= DOT_HIT_RADIUS && distance < nearestDistance) {
      nearestId = position.id;
      nearestDistance = distance;
    }
  }

  if (nearestId === null && preferredDistance <= DOT_HOVER_STICKY_RADIUS) {
    return preferredId;
  }

  return nearestId;
}

function ClickPositionDot({
  index,
  isAnimating,
  isDragging,
  isHovered,
  originX,
  originY,
  onPointerDown,
  position,
  scaleFactor,
}: {
  index: number;
  isAnimating: boolean;
  isDragging: boolean;
  isHovered: boolean;
  originX: number;
  originY: number;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, id: number) => void;
  position: ClickPosition;
  scaleFactor: number;
}) {
  return (
    <div
      className="pointer-events-auto absolute"
      onPointerDown={(event) => onPointerDown(event, position.id)}
      style={{
        left: (position.x - originX) / scaleFactor,
        top: (position.y - originY) / scaleFactor,
        touchAction: "none",
        transform: "translate(-50%, -50%)",
      }}
    >
      <div
        className={cn(
          "relative flex h-7 w-7 items-center justify-center",
          isDragging
            ? "cursor-grabbing"
            : isHovered
              ? "cursor-grab"
              : "cursor-default",
        )}
      >
        <span
          className={cn(
            "pointer-events-none absolute h-3.5 w-3.5 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.78),0_0_0_2px_rgba(0,0,0,0.92),0_0_16px_rgba(255,255,255,0.16)]",
            isAnimating && "click-position-dot-enter",
          )}
          style={{ background: CLICK_POSITION_MARKER_BACKGROUND }}
        />
        <span className="pointer-events-none absolute right-[1px] bottom-[1px] rounded-md border border-white/12 bg-zinc-950/96 px-1 py-[1px] text-[8px] font-semibold leading-none text-zinc-50 shadow-[0_4px_10px_rgba(0,0,0,0.32)]">
          {index + 1}
        </span>
      </div>
    </div>
  );
}

function ProcessPickerCursorHint({
  cursorX,
  cursorY,
  label,
  originX,
  originY,
  scaleFactor,
  theme,
}: {
  cursorX: number;
  cursorY: number;
  label: string | null;
  originX: number;
  originY: number;
  scaleFactor: number;
  theme: ClickPositionOverlayState["theme"];
}) {
  const normalizedLabel = label?.trim();
  if (!normalizedLabel) {
    return null;
  }

  const left = (cursorX - originX) / scaleFactor;
  const top = (cursorY - originY) / scaleFactor;

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left,
        top,
        transform: `translate(${CURSOR_PICKER_OFFSET_X}px, ${CURSOR_PICKER_OFFSET_Y}px)`,
      }}
    >
      <div
        className="max-w-[24rem] rounded-lg border px-3 py-2 backdrop-blur-sm"
        style={{
          backgroundColor: withAlpha(theme.processPickerBackground, 0.95),
          borderColor: withAlpha(theme.processPickerBorder, 0.82),
          boxShadow: `0 18px 45px ${withAlpha(theme.processPickerBackground, 0.5)}, 0 0 0 1px ${withAlpha(theme.processPickerBorder, 0.08)}`,
          color: theme.processPickerText,
        }}
      >
        <span className="block max-w-[20rem] truncate text-[12px] font-medium leading-none">
          {normalizedLabel}
        </span>
      </div>
    </div>
  );
}

export function UniversalOverlayApp() {
  const [overlayState, setOverlayState] = useState<ClickPositionOverlayState>(
    emptyClickPositionOverlayState(),
  );
  const [animatingIds, setAnimatingIds] = useState<number[]>([]);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoveredDotId, setHoveredDotId] = useState<number | null>(null);
  const [scaleFactor, setScaleFactor] = useState(1);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const isInteractiveRef = useRef(false);
  const processPickerActive = overlayState.processPicker.active;
  const edgeStopTouchFeedback = useEdgeStopTouchFeedback(
    overlayState.edgeStop.enabled,
  );

  useEffect(() => {
    document.documentElement.dataset.overlayWindow = "click-position";
    setScaleFactor(window.devicePixelRatio || 1);

    function handleScaleChange() {
      setScaleFactor(window.devicePixelRatio || 1);
    }

    window.addEventListener("resize", handleScaleChange);

    return () => {
      window.removeEventListener("resize", handleScaleChange);
      delete document.documentElement.dataset.overlayWindow;
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return undefined;
    }

    let cancelled = false;
    let dispose: (() => void) | undefined;

    void getClickPositionOverlayState()
      .then((state) => {
        if (!cancelled) {
          setOverlayState(state);
        }
      })
      .catch((error) => {
        console.error("Unable to read click position overlay state", error);
      });

    void listen<ClickPositionOverlayState>(
      CLICK_POSITION_OVERLAY_UPDATE_EVENT,
      (event) => {
        if (!cancelled) {
          setOverlayState(event.payload);
        }
      },
    ).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }

      dispose = unlisten;
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    const seenIds = seenIdsRef.current;
    const nextAnimatingIds = overlayState.positions
      .filter((position) => !seenIds.has(position.id))
      .map((position) => position.id);

    for (const position of overlayState.positions) {
      seenIds.add(position.id);
    }

    if (nextAnimatingIds.length === 0) {
      return undefined;
    }

    setAnimatingIds((current) =>
      Array.from(new Set([...current, ...nextAnimatingIds])),
    );

    const timeoutId = window.setTimeout(() => {
      setAnimatingIds((current) =>
        current.filter((id) => !nextAnimatingIds.includes(id)),
      );
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [overlayState.positions]);

  useEffect(() => {
    if (
      draggingId !== null &&
      !overlayState.positions.some((position) => position.id === draggingId)
    ) {
      setDraggingId(null);
    }
  }, [draggingId, overlayState.positions]);

  useEffect(() => {
    if (!processPickerActive) {
      return;
    }

    setDraggingId(null);
    setHoveredDotId(null);
  }, [processPickerActive]);

  useEffect(() => {
    if (!overlayState.editable) {
      return;
    }

    setDraggingId(null);
    setHoveredDotId(null);
  }, [overlayState.editable]);

  useEffect(() => {
    if (!isTauri() || !overlayState.editable || processPickerActive) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      void emitTo("main", CLICK_POSITION_OVERLAY_REGION_CANCEL_EVENT, {
        cancelled: true,
      } satisfies ClickPositionOverlayRegionCancelEvent).catch((error) => {
        console.error("Unable to emit click region cancellation", error);
      });
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [overlayState.editable, processPickerActive]);

  useEffect(() => {
    if (!isTauri()) {
      return undefined;
    }

    const shouldBeInteractive =
      overlayState.visible &&
      !processPickerActive &&
      !overlayState.editable &&
      overlayState.positions.length > 0 &&
      (draggingId !== null || hoveredDotId !== null);
    if (isInteractiveRef.current === shouldBeInteractive) {
      return undefined;
    }

    isInteractiveRef.current = shouldBeInteractive;

    void setClickPositionOverlayInteractive(shouldBeInteractive).catch(
      (error) => {
        console.error(
          "Unable to update click position overlay interactivity",
          error,
        );
      },
    );

    return undefined;
  }, [
    draggingId,
    hoveredDotId,
    overlayState.editable,
    overlayState.positions.length,
    overlayState.visible,
    processPickerActive,
  ]);

  useEffect(() => {
    return () => {
      if (!isTauri() || !isInteractiveRef.current) {
        return;
      }

      isInteractiveRef.current = false;
      void setClickPositionOverlayInteractive(false).catch((error) => {
        console.error(
          "Unable to reset click position overlay interactivity",
          error,
        );
      });
    };
  }, []);

  useEffect(() => {
    if (
      !isTauri() ||
      !overlayState.visible ||
      overlayState.editable ||
      processPickerActive ||
      overlayState.positions.length === 0
    ) {
      setHoveredDotId(null);
      return undefined;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    async function pollCursor() {
      try {
        const cursor = await getCurrentCursorPosition();
        if (cancelled) {
          return;
        }

        const nextHoveredId =
          draggingId !== null
            ? draggingId
            : findNearbyDotId(
                cursor.x,
                cursor.y,
                overlayState.positions,
                hoveredDotId,
              );

        setHoveredDotId((current) =>
          current === nextHoveredId ? current : nextHoveredId,
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to poll click position overlay cursor", error);
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(() => {
            void pollCursor();
          }, CURSOR_POLL_MS);
        }
      }
    }

    void pollCursor();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    draggingId,
    hoveredDotId,
    overlayState.editable,
    overlayState.positions,
    overlayState.visible,
    processPickerActive,
  ]);

  useEffect(() => {
    if (!isTauri() || draggingId === null) {
      return undefined;
    }

    function updateDraggedPosition(clientX: number, clientY: number) {
      const nextX = Math.round(overlayState.originX + clientX * scaleFactor);
      const nextY = Math.round(overlayState.originY + clientY * scaleFactor);

      setOverlayState((current) => ({
        ...current,
        positions: current.positions.map((position) =>
          position.id === draggingId
            ? {
                ...position,
                x: nextX,
                y: nextY,
              }
            : position,
        ),
      }));

      return { x: nextX, y: nextY };
    }

    function handlePointerMove(event: PointerEvent) {
      updateDraggedPosition(event.clientX, event.clientY);
    }

    function finishDragging(event: PointerEvent) {
      const dragId = draggingId;
      if (dragId === null) {
        return;
      }

      const { x, y } = updateDraggedPosition(event.clientX, event.clientY);
      setDraggingId(null);
      setHoveredDotId(dragId);
      void emitTo("main", CLICK_POSITION_OVERLAY_MOVE_EVENT, {
        id: dragId,
        x,
        y,
      } satisfies ClickPositionOverlayMoveEvent).catch((error) => {
        console.error("Unable to emit moved click position", error);
      });
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDragging);
    window.addEventListener("pointercancel", finishDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDragging);
      window.removeEventListener("pointercancel", finishDragging);
    };
  }, [draggingId, overlayState.originX, overlayState.originY, scaleFactor]);

  function handlePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    id: number,
  ) {
    if (overlayState.editable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDraggingId(id);
    setHoveredDotId(id);
  }

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-transparent">
      <ClickRegionOverlay
        bounds={{
          height: overlayState.height,
          width: overlayState.width,
          x: overlayState.originX,
          y: overlayState.originY,
        }}
        editable={overlayState.editable && !processPickerActive}
        onConfirm={() => {
          void emitTo("main", CLICK_POSITION_OVERLAY_REGION_CONFIRM_EVENT, {
            region: isClickRegionValid(overlayState.clickRegion)
              ? overlayState.clickRegion
              : null,
          } satisfies ClickPositionOverlayRegionConfirmEvent).catch((error) => {
            console.error("Unable to emit click region confirmation", error);
          });
        }}
        onRegionChange={(nextRegion) => {
          setOverlayState((current) => ({
            ...current,
            clickRegion: nextRegion,
          }));
        }}
        region={overlayState.clickRegion}
        scaleFactor={scaleFactor}
        theme={overlayState.theme}
      />
      <UniversalEdgeStopOverlay
        edgeStop={overlayState.edgeStop}
        originX={overlayState.originX}
        originY={overlayState.originY}
        scaleFactor={scaleFactor}
        theme={overlayState.theme}
      />
      <UniversalEdgeStopTouchBloom
        feedback={edgeStopTouchFeedback}
        originX={overlayState.originX}
        originY={overlayState.originY}
        scaleFactor={scaleFactor}
        theme={overlayState.theme}
      />
      {overlayState.positions.map((position, index) => (
        <ClickPositionDot
          index={index}
          isAnimating={animatingIds.includes(position.id)}
          isDragging={draggingId === position.id}
          isHovered={hoveredDotId === position.id}
          key={position.id}
          onPointerDown={handlePointerDown}
          originX={overlayState.originX}
          originY={overlayState.originY}
          position={position}
          scaleFactor={scaleFactor}
        />
      ))}
      {processPickerActive ? (
        <ProcessPickerCursorHint
          cursorX={overlayState.processPicker.cursorX}
          cursorY={overlayState.processPicker.cursorY}
          label={overlayState.processPicker.label}
          originX={overlayState.originX}
          originY={overlayState.originY}
          scaleFactor={scaleFactor}
          theme={overlayState.theme}
        />
      ) : null}
    </div>
  );
}
