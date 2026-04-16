import type { ReactNode } from "react"

import { cn } from "@tauri-ui/lib/utils"

type PanelFrameProps = {
  children?: ReactNode
  className?: string
}

export function PanelFrame({ children, className }: PanelFrameProps) {
  return (
    <div className={cn("border border-border/70 bg-card/70 shadow-sm", className)}>
      {children}
    </div>
  )
}
