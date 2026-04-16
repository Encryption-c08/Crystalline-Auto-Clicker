import type { Dispatch, ReactNode, SetStateAction } from "react"

import type { AutoClickerSettings } from "@/config/settings"
import {
  finalizeClickLimit,
  normalizeClickLimitInput,
} from "@/config/runtime"
import { PanelFrame } from "@/components/panel-frame"
import { Input } from "@tauri-ui/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@tauri-ui/components/ui/toggle-group"
import { cn } from "@tauri-ui/lib/utils"

const CLICK_LIMIT_DESCRIPTION =
  "Stops the auto clicker after a set number of clicks have been performed."

function DescriptionTooltip({ children }: { children: ReactNode }) {
  return (
    <div className="group/tooltip relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[20rem] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/tooltip:opacity-100">
        <div className="rounded-md border border-white/12 bg-zinc-950/98 px-3 py-1.5 text-xs text-zinc-50 shadow-[0_18px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-sm">
          {CLICK_LIMIT_DESCRIPTION}
        </div>
        <div className="absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b border-white/12 bg-zinc-950/98" />
      </div>
    </div>
  )
}

type ClickLimitPanelProps = {
  settings: AutoClickerSettings
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>
}

export function ClickLimitPanel({
  settings,
  setSettings,
}: ClickLimitPanelProps) {
  const { clickLimit, clickLimitEnabled } = settings

  const inputGroup = (
    <div
      className={cn(
        "flex h-8 min-w-0 items-stretch overflow-hidden rounded-lg border transition-colors",
        clickLimitEnabled
          ? "border-border/70 bg-background/65"
          : "border-border/60 bg-background/30 opacity-70"
      )}
    >
      <Input
        aria-label="Max clicks"
        className="h-full w-24 rounded-none border-0 bg-transparent px-3 text-center text-base font-semibold shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-base"
        disabled={!clickLimitEnabled}
        inputMode="numeric"
        onBlur={() =>
          setSettings((current) => ({
            ...current,
            clickLimit: finalizeClickLimit(current.clickLimit),
          }))
        }
        onChange={(event) =>
          setSettings((current) => ({
            ...current,
            clickLimit: normalizeClickLimitInput(event.target.value),
          }))
        }
        type="text"
        value={clickLimit}
      />
      <div
        className={cn(
          "flex items-center border-l border-border/70 px-3 text-[11px] font-semibold uppercase tracking-[0.12em]",
          clickLimitEnabled
            ? "text-muted-foreground"
            : "text-muted-foreground/80"
        )}
      >
        Clicks
      </div>
    </div>
  )

  const rowContent = (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors",
        clickLimitEnabled
          ? "border-border/70 bg-card/35"
          : "border-border/60 bg-background/20 hover:bg-background/28"
      )}
    >
      <div className="min-w-0 shrink-0 pr-2">
        <p className="text-base font-semibold text-foreground">Click Limit</p>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {clickLimitEnabled ? (
          <DescriptionTooltip>{inputGroup}</DescriptionTooltip>
        ) : (
          inputGroup
        )}

        <ToggleGroup
          className="rounded-lg border border-border bg-background/60 p-0.5"
          onValueChange={(value) => {
            if (!value) {
              return
            }

            setSettings((current) => ({
              ...current,
              clickLimitEnabled: value === "on",
            }))
          }}
          size="sm"
          type="single"
          value={clickLimitEnabled ? "on" : "off"}
          variant="default"
        >
          <ToggleGroupItem
            aria-label="Turn click limit off"
            className="h-7 rounded-md px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-background/90 data-[state=on]:text-foreground focus-visible:ring-0"
            value="off"
          >
            Off
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Turn click limit on"
            className="h-7 rounded-md px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-muted-foreground/15 data-[state=on]:text-foreground focus-visible:ring-0"
            value="on"
          >
            On
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )

  return (
    <PanelFrame className="max-w-full justify-self-start rounded-md p-1.5 w-fit">
      {clickLimitEnabled ? (
        rowContent
      ) : (
        <DescriptionTooltip>{rowContent}</DescriptionTooltip>
      )}
    </PanelFrame>
  )
}
