import type { Dispatch, ReactNode, SetStateAction } from "react"

import type { DisabledDependencyTarget } from "@/components/disabled-feature-dependency"
import { DisabledReasonOverlay } from "@/components/disabled-reason-overlay"
import {
  finalizeJitterAxis,
  normalizeJitterAxisInput,
} from "@/config/runtime"
import {
  jitterModeLabels,
  jitterModes,
  type AutoClickerSettings,
} from "@/config/settings"
import { Input } from "@tauri-ui/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@tauri-ui/components/ui/toggle-group"
import { cn } from "@tauri-ui/lib/utils"

function DescriptionTooltip({
  children,
  description,
}: {
  children: ReactNode
  description: string
}) {
  return (
    <div className="group/tooltip relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[20rem] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/tooltip:opacity-100">
        <div className="ui-themed-tooltip rounded-md border px-3 py-1.5 text-xs backdrop-blur-sm">
          {description}
        </div>
        <div className="ui-themed-tooltip-arrow absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b" />
      </div>
    </div>
  )
}

type JitterPanelProps = {
  onUnavailablePress?: (target: DisabledDependencyTarget) => void
  settings: AutoClickerSettings
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>
}

export function JitterPanel({
  onUnavailablePress,
  settings,
  setSettings,
}: JitterPanelProps) {
  const { jitterEnabled, jitterMode, jitterX, jitterY, mouseAction } = settings
  const isJitterAvailable = mouseAction === "click"
  const isJitterActive = isJitterAvailable && jitterEnabled
  const unavailableReason = !isJitterAvailable
    ? "Disabled due to Action: Hold"
    : null
  const jitterDescription =
    "Moves the cursor away from the original click point using your X and Y pixel offsets before clicking."
  const jitterModeDescriptions = {
    fixed:
      "Always uses the exact X and Y offsets you entered.\nClicks again after returning to the original point.",
    random:
      "Picks a random X and Y offset within your configured range.\nClicks again after returning to the original point whenever the cursor actually moved away from it.",
  } satisfies Record<AutoClickerSettings["jitterMode"], string>

  function commitJitterAxes() {
    setSettings((current) => ({
      ...current,
      jitterX: finalizeJitterAxis(current.jitterX),
      jitterY: finalizeJitterAxis(current.jitterY),
    }))
  }

  const inputGroup = (
    <div
      className={cn(
        "flex h-8 min-w-0 items-stretch overflow-hidden rounded-lg border transition-colors",
        isJitterActive
          ? "border-border/70 bg-background/65"
          : "border-border/60 bg-background/30 opacity-70"
      )}
    >
      <div
        className={cn(
          "flex items-center px-2 text-[10px] font-semibold uppercase tracking-[0.18em]",
          isJitterActive
            ? "text-muted-foreground"
            : "text-muted-foreground/80"
        )}
      >
        X
      </div>
      <Input
        aria-label="Horizontal jitter pixels"
        className="h-full w-14 rounded-none border-0 bg-transparent px-2 text-center text-base font-semibold shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-base"
        disabled={!isJitterActive}
        inputMode="text"
        onBlur={commitJitterAxes}
        onChange={(event) =>
          setSettings((current) => ({
            ...current,
            jitterX: normalizeJitterAxisInput(event.target.value),
          }))
        }
        type="text"
        value={jitterX}
      />
      <div
        className={cn(
          "flex items-center border-l border-border/70 px-2 text-[10px] font-semibold uppercase tracking-[0.18em]",
          isJitterActive
            ? "text-muted-foreground"
            : "text-muted-foreground/80"
        )}
      >
        Y
      </div>
      <div className="border-l border-border/70">
        <Input
          aria-label="Vertical jitter pixels"
          className="h-full w-14 rounded-none border-0 bg-transparent px-2 text-center text-base font-semibold shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-base"
          disabled={!isJitterActive}
          inputMode="text"
          onBlur={commitJitterAxes}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              jitterY: normalizeJitterAxisInput(event.target.value),
            }))
          }
          type="text"
          value={jitterY}
        />
      </div>
      <div
        className={cn(
          "flex items-center border-l border-border/70 px-3 text-[11px] font-semibold uppercase tracking-[0.12em]",
          isJitterActive
            ? "text-muted-foreground"
            : "text-muted-foreground/80"
        )}
      >
        Px
      </div>
    </div>
  )

  const modeGroup = (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        !isJitterAvailable && "opacity-70"
      )}
    >
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Mode
      </span>
      <ToggleGroup
        className="rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
        onValueChange={(value) => {
          if (!value) {
            return
          }

          setSettings((current) => ({
            ...current,
            jitterMode: value as AutoClickerSettings["jitterMode"],
          }))
        }}
        size="sm"
        type="single"
        value={jitterMode}
        variant="default"
      >
        {jitterModes.map((value) => (
          <ToggleGroupItem
            key={value}
            aria-label={`Set jitter mode to ${jitterModeLabels[value]}`}
            className="group/jitter-mode-item relative px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0"
            disabled={!isJitterAvailable}
            value={value}
          >
            <span>{jitterModeLabels[value]}</span>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 max-w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/jitter-mode-item:opacity-100">
              <div className="ui-themed-tooltip rounded-md border px-3 py-1.5 text-left text-xs whitespace-pre-line normal-case tracking-normal backdrop-blur-sm">
                {jitterModeDescriptions[value]}
              </div>
              <div className="ui-themed-tooltip-arrow absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b" />
            </div>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )

  const rowContent = (
    <div
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors",
        isJitterActive
          ? "border-border/70 bg-card/35"
          : "border-border/60 bg-background/20 hover:bg-background/28"
      )}
    >
      <div className="min-w-0 shrink-0 pr-2">
        <p className="text-base font-semibold text-foreground">Jitter</p>
      </div>

      <div className="relative ml-auto grid w-full max-w-[21rem] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="grid min-w-0 gap-2">
          <DescriptionTooltip description={jitterDescription}>
            {inputGroup}
          </DescriptionTooltip>
          {modeGroup}
        </div>

        <ToggleGroup
          className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
          onValueChange={(value) => {
            if (!value) {
              return
            }

            setSettings((current) => ({
              ...current,
              jitterEnabled: value === "on",
            }))
          }}
          size="sm"
          type="single"
          value={isJitterActive ? "on" : "off"}
          variant="default"
        >
          <ToggleGroupItem
            aria-label="Turn jitter off"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-background/90 data-[state=on]:text-foreground focus-visible:ring-0"
            disabled={!isJitterAvailable}
            value="off"
          >
            Off
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Turn jitter on"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-muted-foreground/15 data-[state=on]:text-foreground focus-visible:ring-0"
            disabled={!isJitterAvailable}
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
    <>{rowContent}</>
  )
}
