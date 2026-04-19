import type { EdgeStopFeedback } from "@/config/runtime";
import type { OverlayVisualTheme } from "@/config/theme";
import { withAlpha } from "@/lib/color";

export function UniversalEdgeStopTouchBloom({
  feedback,
  originX,
  originY,
  scaleFactor,
  theme,
}: {
  feedback: EdgeStopFeedback | null;
  originX: number;
  originY: number;
  scaleFactor: number;
  theme: OverlayVisualTheme;
}) {
  if (!feedback) {
    return null;
  }

  const renderLeft = (feedback.x - originX) / scaleFactor;
  const renderTop = (feedback.y - originY) / scaleFactor;

  return (
    <div
      className="pointer-events-none absolute overflow-visible"
      style={{
        left: renderLeft,
        top: renderTop,
      }}
    >
      <div className="relative h-0 w-0" key={feedback.id}>
        <div
          className="edge-stop-touch-bloom-halo absolute left-1/2 top-1/2 h-28 w-28 rounded-full blur-[4px]"
          style={{
            background: `radial-gradient(circle at center, ${withAlpha(theme.edgeStopFill, 0.52)} 0%, ${withAlpha(theme.edgeStopFill, 0.24)} 24%, ${withAlpha(theme.edgeStopFill, 0.08)} 48%, ${withAlpha(theme.edgeStopFill, 0)} 74%)`,
          }}
        />
        <div
          className="edge-stop-touch-bloom-core absolute left-1/2 top-1/2 h-10 w-10 rounded-full"
          style={{
            background: `radial-gradient(circle at center, ${withAlpha(theme.edgeStopLine, 0.96)} 0%, ${withAlpha(theme.edgeStopLine, 0.54)} 32%, ${withAlpha(theme.edgeStopLine, 0.16)} 62%, ${withAlpha(theme.edgeStopLine, 0)} 100%)`,
          }}
        />
        <div
          className="edge-stop-touch-bloom-ring absolute left-1/2 top-1/2 h-14 w-14 rounded-full border"
          style={{
            borderColor: withAlpha(theme.edgeStopLine, 0.7),
            boxShadow: `0 0 24px ${withAlpha(theme.edgeStopLine, 0.22)}`,
          }}
        />
      </div>
    </div>
  );
}
