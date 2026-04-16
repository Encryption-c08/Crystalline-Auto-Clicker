import type { Dispatch, ReactNode, SetStateAction } from "react"
import { useEffect, useRef, useState } from "react"

import { CheckIcon, ChevronDownIcon } from "lucide-react"

import {
  clickRateUnitLabels,
  clickRateUnits,
  type AutoClickerSettings,
  type ClickRateUnit,
} from "@/config/settings"
import {
  finalizeTimeLimit,
  normalizeTimeLimitInput,
} from "@/config/runtime"
import { PanelFrame } from "@/components/panel-frame"
import { Input } from "@tauri-ui/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@tauri-ui/components/ui/toggle-group"
import { cn } from "@tauri-ui/lib/utils"

const TIME_LIMIT_DESCRIPTION =
  "Automatically stops the auto clicker after the selected amount of time."

function DescriptionTooltip({ children }: { children: ReactNode }) {
  return (
    <div className="group/tooltip relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[20rem] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/tooltip:opacity-100">
        <div className="rounded-md border border-white/12 bg-zinc-950/98 px-3 py-1.5 text-xs text-zinc-50 shadow-[0_18px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-sm">
          {TIME_LIMIT_DESCRIPTION}
        </div>
        <div className="absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b border-white/12 bg-zinc-950/98" />
      </div>
    </div>
  )
}

type TimeLimitPanelProps = {
  settings: AutoClickerSettings
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>
}

export function TimeLimitPanel({
  settings,
  setSettings,
}: TimeLimitPanelProps) {
  const { timeLimit, timeLimitEnabled, timeLimitUnit } = settings
  const [isTimeLimitUnitOpen, setIsTimeLimitUnitOpen] = useState(false)
  const timeLimitUnitRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isTimeLimitUnitOpen) {
      return undefined
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        timeLimitUnitRef.current &&
        !timeLimitUnitRef.current.contains(event.target as Node)
      ) {
        setIsTimeLimitUnitOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsTimeLimitUnitOpen(false)
      }
    }

    window.addEventListener("mousedown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("mousedown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isTimeLimitUnitOpen])

  const inputGroup = (
    <div
      className={cn(
        "flex h-8 min-w-0 items-stretch overflow-visible rounded-lg border transition-colors",
        timeLimitEnabled
          ? "border-border/70 bg-background/65"
          : "border-border/60 bg-background/30 opacity-70"
      )}
    >
      <Input
        aria-label="Time limit value"
        className="h-full w-20 rounded-none border-0 bg-transparent px-3 text-center text-base font-semibold shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-base"
        disabled={!timeLimitEnabled}
        inputMode="numeric"
        onBlur={() =>
          setSettings((current) => ({
            ...current,
            timeLimit: finalizeTimeLimit(current.timeLimit),
          }))
        }
        onChange={(event) =>
          setSettings((current) => ({
            ...current,
            timeLimit: normalizeTimeLimitInput(event.target.value),
          }))
        }
        type="text"
        value={timeLimit}
      />

      <div className="relative" ref={timeLimitUnitRef}>
        <button
          aria-expanded={isTimeLimitUnitOpen}
          aria-haspopup="listbox"
          className={cn(
            "flex h-full min-w-[7.5rem] items-center justify-between gap-2 border-l border-border/70 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-0",
            timeLimitEnabled
              ? cn(
                  "text-muted-foreground hover:bg-background/55",
                  isTimeLimitUnitOpen && "rounded-tr-lg bg-background/80"
                )
              : "cursor-not-allowed text-muted-foreground/80"
          )}
          disabled={!timeLimitEnabled}
          onClick={() => setIsTimeLimitUnitOpen((current) => !current)}
          type="button"
        >
          <span>{clickRateUnitLabels[timeLimitUnit]}</span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 transition-transform duration-200",
              isTimeLimitUnitOpen && "rotate-180"
            )}
          />
        </button>

        {isTimeLimitUnitOpen ? (
          <div
            className="absolute top-full left-0 z-20 -mt-px min-w-full overflow-hidden rounded-b-lg border border-border border-t-0 bg-background/95"
            role="listbox"
          >
            <div className="p-1">
              {clickRateUnits.map((value) => {
                const isSelected = value === timeLimitUnit

                return (
                  <button
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
                      isSelected
                        ? "bg-muted-foreground/14 text-foreground"
                        : "text-foreground/88 hover:bg-muted-foreground/10"
                    )}
                    key={value}
                    onClick={() => {
                      setSettings((current) => ({
                        ...current,
                        timeLimitUnit: value as ClickRateUnit,
                      }))
                      setIsTimeLimitUnitOpen(false)
                    }}
                    role="option"
                    type="button"
                  >
                    <span>{clickRateUnitLabels[value]}</span>
                    <CheckIcon
                      className={cn(
                        "size-3.5 text-foreground/80 transition-opacity",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  const rowContent = (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors",
        timeLimitEnabled
          ? "border-border/70 bg-card/35"
          : "border-border/60 bg-background/20 hover:bg-background/28"
      )}
    >
      <div className="min-w-0 shrink-0 pr-2">
        <p className="text-base font-semibold text-foreground">Time Limit</p>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {timeLimitEnabled ? (
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
              timeLimitEnabled: value === "on",
            }))
            if (value === "off") {
              setIsTimeLimitUnitOpen(false)
            }
          }}
          size="sm"
          type="single"
          value={timeLimitEnabled ? "on" : "off"}
          variant="default"
        >
          <ToggleGroupItem
            aria-label="Turn time limit off"
            className="h-7 rounded-md px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-background/90 data-[state=on]:text-foreground focus-visible:ring-0"
            value="off"
          >
            Off
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Turn time limit on"
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
    <PanelFrame className="w-fit max-w-full justify-self-start rounded-md p-1.5">
      {timeLimitEnabled ? (
        rowContent
      ) : (
        <DescriptionTooltip>{rowContent}</DescriptionTooltip>
      )}
    </PanelFrame>
  )
}
