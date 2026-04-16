import { cn } from "@tauri-ui/lib/utils"

type DisabledReasonOverlayProps = {
  className?: string
  onClick?: () => void
  reason: string
}

export function DisabledReasonOverlay({
  className,
  onClick,
  reason,
}: DisabledReasonOverlayProps) {
  const content = (
    <div className="rounded-full border border-white/12 bg-zinc-950/94 px-3 py-1 text-[11px] font-semibold text-zinc-50 shadow-[0_12px_28px_rgba(0,0,0,0.38)]">
      {reason}
    </div>
  )

  if (onClick) {
    return (
      <button
        className={cn(
          "absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-xl bg-background/22 outline-none backdrop-blur-[2.5px] focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
          className
        )}
        onClick={(event) => {
          event.stopPropagation()
          event.currentTarget.blur()
          onClick()
        }}
        type="button"
      >
        {content}
      </button>
    )
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/22 backdrop-blur-[2.5px]",
        className
      )}
    >
      {content}
    </div>
  )
}
