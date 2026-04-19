import type { EdgeStopOverlayState } from "@/lib/click-position-overlay";
import type { OverlayVisualTheme } from "@/config/theme";
import { withAlpha } from "@/lib/color";

type OverlayZone = EdgeStopOverlayState["zones"][number];

function zoneKey(zone: EdgeStopOverlayState["zones"][number], index: number) {
  return `${zone.x}:${zone.y}:${zone.width}:${zone.height}:${index}`;
}

function zoneBottom(zone: OverlayZone) {
  return zone.y + zone.height;
}

function zoneRight(zone: OverlayZone) {
  return zone.x + zone.width;
}

function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return Math.max(startA, startB) < Math.min(endA, endB);
}

function rangeOverlapSize(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function isHorizontalZone(zone: OverlayZone) {
  return zone.width >= zone.height;
}

function horizontalZoneConnections(zone: OverlayZone, zones: OverlayZone[]) {
  let leftClip = 0;
  let rightClip = 0;
  let leftConnected = false;
  let rightConnected = false;
  let innerSide: "top" | "bottom" | null = null;

  for (const otherZone of zones) {
    if (otherZone === zone || isHorizontalZone(otherZone)) {
      continue;
    }

    if (
      !rangesOverlap(
        zone.y,
        zoneBottom(zone),
        otherZone.y,
        zoneBottom(otherZone),
      )
    ) {
      continue;
    }

    const overlapWidth = rangeOverlapSize(
      zone.x,
      zoneRight(zone),
      otherZone.x,
      zoneRight(otherZone),
    );
    if (overlapWidth <= 0) {
      continue;
    }

    if (zone.x === otherZone.x) {
      leftConnected = true;
      leftClip = Math.max(leftClip, overlapWidth);
    }
    if (zoneRight(zone) === zoneRight(otherZone)) {
      rightConnected = true;
      rightClip = Math.max(rightClip, overlapWidth);
    }
    if (zone.y === otherZone.y) {
      innerSide = "bottom";
    }
    if (zoneBottom(zone) === zoneBottom(otherZone)) {
      innerSide = "top";
    }
  }

  return { innerSide, leftClip, leftConnected, rightClip, rightConnected };
}

function verticalZoneConnections(zone: OverlayZone, zones: OverlayZone[]) {
  let topClip = 0;
  let bottomClip = 0;
  let topConnected = false;
  let bottomConnected = false;
  let innerSide: "left" | "right" | null = null;

  for (const otherZone of zones) {
    if (otherZone === zone || !isHorizontalZone(otherZone)) {
      continue;
    }

    if (
      !rangesOverlap(zone.x, zoneRight(zone), otherZone.x, zoneRight(otherZone))
    ) {
      continue;
    }

    const overlapHeight = rangeOverlapSize(
      zone.y,
      zoneBottom(zone),
      otherZone.y,
      zoneBottom(otherZone),
    );
    if (overlapHeight <= 0) {
      continue;
    }

    if (zone.y === otherZone.y) {
      topConnected = true;
      topClip = Math.max(topClip, overlapHeight);
    }

    if (zoneBottom(zone) === zoneBottom(otherZone)) {
      bottomConnected = true;
      bottomClip = Math.max(bottomClip, overlapHeight);
    }

    if (zone.x === otherZone.x) {
      innerSide = "right";
    }

    if (zoneRight(zone) === zoneRight(otherZone)) {
      innerSide = "left";
    }
  }

  return { bottomClip, bottomConnected, innerSide, topClip, topConnected };
}

export function UniversalEdgeStopOverlay({
  edgeStop,
  originX,
  originY,
  scaleFactor,
  theme,
}: {
  edgeStop: EdgeStopOverlayState;
  originX: number;
  originY: number;
  scaleFactor: number;
  theme: OverlayVisualTheme;
}) {
  if (!edgeStop.enabled || edgeStop.zones.length === 0) {
    return null;
  }

  const lineColor = withAlpha(theme.edgeStopLine, 0.72);
  const fillColor = withAlpha(theme.edgeStopFill, 0.18);
  const fillShadow = `0 0 24px ${withAlpha(theme.edgeStopFill, 0.24)}`;

  return (
    <>
      {edgeStop.zones.map((zone, index) => {
        if (zone.width <= 0 || zone.height <= 0) {
          return null;
        }

        const isHorizontal = isHorizontalZone(zone);
        const horizontalConnections = isHorizontal
          ? horizontalZoneConnections(zone, edgeStop.zones)
          : null;
        const verticalConnections = !isHorizontal
          ? verticalZoneConnections(zone, edgeStop.zones)
          : null;
        const verticalFillTop = !isHorizontal
          ? (verticalConnections?.topClip ?? 0) / scaleFactor
          : 0;
        const verticalFillBottom = !isHorizontal
          ? (verticalConnections?.bottomClip ?? 0) / scaleFactor
          : 0;
        const verticalFillHeight = !isHorizontal
          ? Math.max(
              0,
              zone.height -
                (verticalConnections?.topClip ?? 0) -
                (verticalConnections?.bottomClip ?? 0),
            ) / scaleFactor
          : zone.height / scaleFactor;
        const shouldSuppressFillShadow =
          !isHorizontal &&
          ((verticalConnections?.topClip ?? 0) > 0 ||
            (verticalConnections?.bottomClip ?? 0) > 0);
        const verticalLineTop =
          verticalFillTop > 0 ? Math.max(0, verticalFillTop - 1) : 0;
        const verticalLineBottom =
          verticalFillBottom > 0 ? Math.max(0, verticalFillBottom - 1) : 0;
        const horizontalInnerLineLeft =
          ((horizontalConnections?.innerSide ?? null) !== null
            ? (horizontalConnections?.leftClip ?? 0)
            : 0) / scaleFactor;
        const hasHorizontalInnerClip =
          (horizontalConnections?.innerSide ?? null) !== null;
        const horizontalLeftConnected =
          hasHorizontalInnerClip &&
          (horizontalConnections?.leftConnected ?? false);
        const horizontalRightConnected =
          hasHorizontalInnerClip &&
          (horizontalConnections?.rightConnected ?? false);
        const horizontalLineLeft = hasHorizontalInnerClip
          ? Math.max(
              0,
              horizontalInnerLineLeft - (horizontalLeftConnected ? 1 : 0),
            )
          : 0;
        const horizontalLineRight = hasHorizontalInnerClip
          ? Math.max(
              0,
              (horizontalConnections?.rightClip ?? 0) / scaleFactor -
                (horizontalRightConnected ? 1 : 0),
            )
          : 0;
        const horizontalLineWidth = hasHorizontalInnerClip
          ? Math.max(
              0,
              zone.width / scaleFactor -
                horizontalLineLeft -
                horizontalLineRight,
            )
          : zone.width / scaleFactor;

        return (
          <div
            className="pointer-events-none absolute"
            key={zoneKey(zone, index)}
            style={{
              height: zone.height / scaleFactor,
              left: (zone.x - originX) / scaleFactor,
              top: (zone.y - originY) / scaleFactor,
              width: zone.width / scaleFactor,
            }}
          >
            {isHorizontal || verticalFillHeight > 0 ? (
              <div
                className="absolute left-0 right-0 transition-[background-color,box-shadow] duration-150"
                style={{
                  backgroundColor: fillColor,
                  bottom: isHorizontal ? 0 : verticalFillBottom,
                  boxShadow: shouldSuppressFillShadow ? undefined : fillShadow,
                  top: isHorizontal ? 0 : verticalFillTop,
                }}
              />
            ) : null}

            {isHorizontal ? (
              <>
                {horizontalConnections?.innerSide === "top" ? (
                  horizontalLineWidth > 0 ? (
                    <div
                      className="absolute top-0 h-px transition-colors duration-150"
                      style={{
                        backgroundColor: lineColor,
                        left: horizontalLineLeft,
                        width: horizontalLineWidth,
                      }}
                    />
                  ) : null
                ) : (
                  <div
                    className="absolute left-0 right-0 top-0 h-px transition-colors duration-150"
                    style={{ backgroundColor: lineColor }}
                  />
                )}
                {horizontalConnections?.innerSide === "bottom" ? (
                  horizontalLineWidth > 0 ? (
                    <div
                      className="absolute bottom-0 h-px transition-colors duration-150"
                      style={{
                        backgroundColor: lineColor,
                        left: horizontalLineLeft,
                        width: horizontalLineWidth,
                      }}
                    />
                  ) : null
                ) : (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-px transition-colors duration-150"
                    style={{ backgroundColor: lineColor }}
                  />
                )}
                <div
                  className="absolute bottom-0 left-0 top-0 w-px transition-colors duration-150"
                  style={{ backgroundColor: lineColor }}
                />
                <div
                  className="absolute bottom-0 right-0 top-0 w-px transition-colors duration-150"
                  style={{ backgroundColor: lineColor }}
                />
              </>
            ) : (
              <>
                {!verticalConnections?.topConnected ? (
                  <div
                    className="absolute left-0 right-0 top-0 h-px transition-colors duration-150"
                    style={{ backgroundColor: lineColor }}
                  />
                ) : null}
                {!verticalConnections?.bottomConnected ? (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-px transition-colors duration-150"
                    style={{ backgroundColor: lineColor }}
                  />
                ) : null}
                <div
                  className="absolute right-0 transition-colors duration-150"
                  style={{
                    backgroundColor: lineColor,
                    bottom: verticalLineBottom,
                    top: verticalLineTop,
                    width: 1,
                  }}
                />
                <div
                  className="absolute left-0 transition-colors duration-150"
                  style={{
                    backgroundColor: lineColor,
                    bottom: verticalLineBottom,
                    top: verticalLineTop,
                    width: 1,
                  }}
                />
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
