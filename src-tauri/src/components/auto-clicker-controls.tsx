import type { Dispatch, SetStateAction } from "react"
import { useEffect, useId, useRef, useState } from "react"

import { CheckIcon, ChevronDownIcon } from "lucide-react"

import {
  clickModes,
  clickRateUnitLabels,
  clickRateUnits,
  formatMouseHotkey,
  mouseButtonLabels,
  mouseButtons,
  type AutoClickerSettings,
  type ClickMode,
  type ClickRateUnit,
  type MouseButtonOption,
  formatKeyboardHotkey,
} from "../../../src/auto-clicker/settings"
import { finalizeClickRate, normalizeClickRateInput } from "../../../src/auto-clicker/runtime"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

function TinyLabel({ children }: { children: string }) {
  return (
    <Label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </Label>
  )
}

type AutoClickerControlsProps = {
  settings: AutoClickerSettings
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>
  runtimeError: string | null
}

export function AutoClickerControls({
  settings,
  setSettings,
  runtimeError,
}: AutoClickerControlsProps) {
  const hotkeyId = useId()
  const rateId = useId()
  const rateUnitId = useId()
  const rateUnitDropdownRef = useRef<HTMLDivElement | null>(null)

  const [isCapturingHotkey, setIsCapturingHotkey] = useState(false)
  const [isRateUnitDropdownOpen, setIsRateUnitDropdownOpen] = useState(false)

  const { clickMode, clickRate, clickRateUnit, hotkey, mouseButton } = settings

  useEffect(() => {
    if (!isCapturingHotkey) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        setIsCapturingHotkey(false)
        return
      }

      const nextHotkey = formatKeyboardHotkey(event)
      if (!nextHotkey) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setSettings((current) => ({ ...current, hotkey: nextHotkey }))
      setIsCapturingHotkey(false)
    }

    function handleMouseDown(event: MouseEvent) {
      const target = event.target
      if (
        target instanceof Element &&
        target.closest("[data-hotkey-trigger]") &&
        event.button === 0
      ) {
        return
      }

      const nextHotkey = formatMouseHotkey(event)
      if (!nextHotkey) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setSettings((current) => ({ ...current, hotkey: nextHotkey }))
      setIsCapturingHotkey(false)
    }

    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("mousedown", handleMouseDown, true)

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("mousedown", handleMouseDown, true)
    }
  }, [isCapturingHotkey, setSettings])

  useEffect(() => {
    if (!isRateUnitDropdownOpen) {
      return undefined
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        rateUnitDropdownRef.current &&
        !rateUnitDropdownRef.current.contains(event.target as Node)
      ) {
        setIsRateUnitDropdownOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsRateUnitDropdownOpen(false)
      }
    }

    window.addEventListener("mousedown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("mousedown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isRateUnitDropdownOpen])

  return (
    <div className="grid h-full content-center gap-1.5 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-14 shrink-0">
            <TinyLabel>Rate</TinyLabel>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
          <Label className="sr-only" htmlFor={rateId}>
            Click rate
          </Label>
          <Input
            className="h-8 w-20 bg-background/70 px-2 text-center text-base font-semibold"
            id={rateId}
            inputMode="numeric"
            onBlur={() =>
              setSettings((current) => ({
                ...current,
                clickRate: finalizeClickRate(current.clickRate),
              }))
            }
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                clickRate: normalizeClickRateInput(event.target.value),
              }))
            }
            type="text"
            value={clickRate}
          />
          <div className="text-sm font-medium whitespace-nowrap text-muted-foreground">
            clicks per
          </div>
          <Label className="sr-only" htmlFor={rateUnitId}>
            Click rate unit
          </Label>
          <div className="relative w-32 shrink-0" ref={rateUnitDropdownRef}>
            <button
              aria-controls={rateUnitId}
              aria-expanded={isRateUnitDropdownOpen}
              aria-haspopup="listbox"
              className={cn(
                "flex h-8 w-full items-center justify-between border border-border bg-background/60 px-3 text-sm font-medium text-foreground transition-colors hover:bg-background/80 focus-visible:outline-none focus-visible:ring-0",
                isRateUnitDropdownOpen
                  ? "rounded-t-lg rounded-b-none border-b-transparent bg-background/80"
                  : "rounded-lg"
              )}
              id={rateUnitId}
              onClick={() =>
                setIsRateUnitDropdownOpen((current) => !current)
              }
              type="button"
            >
              <span>{clickRateUnitLabels[clickRateUnit]}</span>
              <ChevronDownIcon
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform duration-200",
                  isRateUnitDropdownOpen && "rotate-180"
                )}
              />
            </button>

            {isRateUnitDropdownOpen ? (
              <div
                className="absolute top-full left-0 z-20 -mt-px w-full overflow-hidden rounded-b-lg border border-border border-t-0 bg-background/95"
                role="listbox"
              >
                <div className="p-1">
                  {clickRateUnits.map((value) => {
                    const isSelected = value === clickRateUnit

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
                            clickRateUnit: value as ClickRateUnit,
                          }))
                          setIsRateUnitDropdownOpen(false)
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
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="w-14 shrink-0">
              <TinyLabel>Hotkey</TinyLabel>
            </div>
            <Button
              className="h-8 min-w-0 flex-1 justify-start rounded-lg bg-background/70 px-3 text-sm focus-visible:ring-0"
              data-hotkey-trigger
              id={hotkeyId}
              onClick={() => setIsCapturingHotkey(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              {isCapturingHotkey ? "Press combo or Mouse 1-5" : hotkey.label}
            </Button>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <TinyLabel>Mode</TinyLabel>
            <ToggleGroup
              className="rounded-lg border border-border bg-background/60 p-0.5"
              onValueChange={(value) => {
                if (value) {
                  setSettings((current) => ({
                    ...current,
                    clickMode: value as ClickMode,
                  }))
                }
              }}
              size="sm"
              type="single"
              value={clickMode}
              variant="default"
            >
              {clickModes.map((value) => (
                <ToggleGroupItem
                  aria-label={`Set click mode to ${value}`}
                  className="rounded-md px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0"
                  key={value}
                  value={value}
                >
                  {value === "toggle" ? "Toggle" : "Hold"}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <TinyLabel>Click</TinyLabel>
            <ToggleGroup
              className="rounded-lg border border-border bg-background/60 p-0.5"
              onValueChange={(value) => {
                if (value) {
                  setSettings((current) => ({
                    ...current,
                    mouseButton: value as MouseButtonOption,
                  }))
                }
              }}
              size="sm"
              type="single"
              value={mouseButton}
              variant="default"
            >
              {mouseButtons.map((value) => (
                <ToggleGroupItem
                  aria-label={`Set click target to ${mouseButtonLabels[value]}`}
                  className="rounded-md px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0"
                  key={value}
                  value={value}
                >
                  {mouseButtonLabels[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        {runtimeError ? (
          <div className="text-[11px] font-medium text-destructive">
            {runtimeError}
          </div>
        ) : null}
    </div>
  )
}
