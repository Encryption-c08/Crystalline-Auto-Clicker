import type { Dispatch, ReactNode, SetStateAction } from "react"

import type { AutoClickerSettings } from "@/config/settings"
import type { DisabledDependencyTarget } from "@/components/disabled-feature-dependency"
import {
  finalizeDoubleClickDelay,
  normalizeDoubleClickDelayInput,
} from "@/config/runtime"
import { DisabledReasonOverlay } from "@/components/disabled-reason-overlay"
import { Input } from "@tauri-ui/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@tauri-ui/components/ui/toggle-group"
import { cn } from "@tauri-ui/lib/utils"

const DOUBLE_CLICK_DESCRIPTION =
  "Sends two clicks each cycle, with an optional delay between the first and second click."

function DescriptionTooltip({ children }: { children: ReactNode }) {
  return (
    <div className="group/tooltip relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[20rem] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/tooltip:opacity-100">
        <div className="ui-themed-tooltip rounded-md border px-3 py-1.5 text-xs backdrop-blur-sm">
          {DOUBLE_CLICK_DESCRIPTION}
        </div>
        <div className="ui-themed-tooltip-arrow absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b" />
      </div>
    </div>
  )
}

type DoubleClickPanelProps = {
  onUnavailablePress?: (target: DisabledDependencyTarget) => void
  settings: AutoClickerSettings
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>
}

export function DoubleClickPanel({
  onUnavailablePress,
  settings,
  setSettings,
}: DoubleClickPanelProps) {
  const { doubleClickDelay, doubleClickEnabled, mouseAction } = settings
  const isDoubleClickAvailable = mouseAction === "click"
  const isDoubleClickActive = isDoubleClickAvailable && doubleClickEnabled
  const unavailableReason = !isDoubleClickAvailable
    ? "Disabled due to Action: Hold"
    : null

  const inputGroup = (
    <div
      className={cn(
        "flex h-8 min-w-0 items-stretch overflow-hidden rounded-lg border transition-colors",
        isDoubleClickActive
          ? "border-border/70 bg-background/65"
          : "border-border/60 bg-background/30 opacity-70"
      )}
    >
      <Input
        aria-label="Double click delay"
        className="h-full w-24 rounded-none border-0 bg-transparent px-3 text-center text-base font-semibold shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-base"
        disabled={!isDoubleClickActive}
        inputMode="numeric"
        onBlur={() =>
          setSettings((current) => ({
            ...current,
            doubleClickDelay: finalizeDoubleClickDelay(current.doubleClickDelay),
          }))
        }
        onChange={(event) =>
          setSettings((current) => ({
            ...current,
            doubleClickDelay: normalizeDoubleClickDelayInput(event.target.value),
          }))
        }
        type="text"
        value={doubleClickDelay}
      />
      <div
        className={cn(
          "flex items-center border-l border-border/70 px-3 text-[11px] font-semibold uppercase tracking-[0.12em]",
          isDoubleClickActive
            ? "text-muted-foreground"
            : "text-muted-foreground/80"
        )}
      >
        Ms
      </div>
    </div>
  )

  const rowContent = (
    <div
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors",
        isDoubleClickActive
          ? "border-border/70 bg-card/35"
          : "border-border/60 bg-background/20 hover:bg-background/28"
      )}
    >
      <div className="min-w-0 shrink-0 pr-2">
        <p className="text-base font-semibold text-foreground">Double Click</p>
      </div>

      <div className="relative ml-auto grid w-full max-w-[18.75rem] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        {isDoubleClickActive ? (
          <DescriptionTooltip>{inputGroup}</DescriptionTooltip>
        ) : (
          inputGroup
        )}

        <ToggleGroup
          className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
          onValueChange={(value) => {
            if (!value) {
              return
            }

            setSettings((current) => ({
              ...current,
              doubleClickEnabled: value === "on",
            }))
          }}
          size="sm"
          type="single"
          value={isDoubleClickActive ? "on" : "off"}
          variant="default"
        >
          <ToggleGroupItem
            aria-label="Turn double click off"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-background/90 data-[state=on]:text-foreground focus-visible:ring-0"
            disabled={!isDoubleClickAvailable}
            value="off"
          >
            Off
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Turn double click on"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-muted-foreground/15 data-[state=on]:text-foreground focus-visible:ring-0"
            disabled={!isDoubleClickAvailable}
            value="on"
          >
            On
          </ToggleGroupItem>
        </ToggleGroup>

        {unavailableReason ? (
          <DisabledReasonOverlay
            onClick={() => onUnavailablePress?.("mouse-action-hold")}
            reason={unavailableReason}
          />
        ) : null}
      </div>
    </div>
  )

  return (
    <>
      {isDoubleClickActive || unavailableReason ? (
        rowContent
      ) : (
        <DescriptionTooltip>{rowContent}</DescriptionTooltip>
      )}
    </>
  )
}
