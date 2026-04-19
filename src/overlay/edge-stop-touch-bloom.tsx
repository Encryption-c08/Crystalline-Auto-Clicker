import type { EdgeStopFeedback } from "@/config/runtime";

export function UniversalEdgeStopTouchBloom({
  feedback,
  originX,
  originY,
  scaleFactor,
}: {
  feedback: EdgeStopFeedback | null;
  originX: number;
  originY: number;
  scaleFactor: number;
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
        <div className="edge-stop-touch-bloom-halo absolute left-1/2 top-1/2 h-28 w-28 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.5)_0%,rgba(255,255,255,0.24)_24%,rgba(255,255,255,0.08)_48%,rgba(255,255,255,0)_74%)] blur-[4px]" />
        <div className="edge-stop-touch-bloom-core absolute left-1/2 top-1/2 h-10 w-10 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.54)_32%,rgba(255,255,255,0.16)_62%,rgba(255,255,255,0)_100%)]" />
        <div className="edge-stop-touch-bloom-ring absolute left-1/2 top-1/2 h-14 w-14 rounded-full border border-white/70 shadow-[0_0_24px_rgba(255,255,255,0.22)]" />
      </div>
    </div>
  );
}
