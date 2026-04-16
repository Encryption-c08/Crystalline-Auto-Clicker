import type { Dispatch, SetStateAction } from "react"
import { useEffect, useId, useRef, useState } from "react"

import { CheckIcon, ChevronDownIcon } from "lucide-react"

import {
  clickModes,
  clickRateModeLabels,
  clickRateModes,
  mouseActionLabels,
  mouseActions,
  clickRateUnitLabels,
  getClickRateUnitsForMode,
  mouseButtonLabels,
  mouseButtons,
  type AutoClickerSettings,
  type ClickMode,
  type ClickRateMode,
  type MouseActionOption,
  type MouseButtonOption,
} from "@/config/settings"
import type {
  DisabledDependencyCue,
  DisabledDependencyTarget,
} from "@/components/disabled-feature-dependency"
import type { SettingsPanelLayout } from "@/components/settings-panel"
import { finalizeClickRate, normalizeClickRateInput } from "@/config/runtime"
import {
  formatKeyboardHotkey,
  formatMouseHotkey,
  UNBOUND_HOTKEY,
} from "@/input/hotkeys"
import { readPressedKeyboardHotkey } from "@/lib/hotkey-capture"
import { isTauri } from "@/lib/tauri"
import { Button } from "@tauri-ui/components/ui/button"
import { Input } from "@tauri-ui/components/ui/input"
import { Label } from "@tauri-ui/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@tauri-ui/components/ui/toggle-group"
import { cn } from "@tauri-ui/lib/utils"

function TinyLabel({ children }: { children: string }) {
  return (
    <Label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </Label>
  )
}

type SettingsPanelContentProps = {
  disabledDependencyCue: DisabledDependencyCue | null
  layout?: SettingsPanelLayout
  settings: AutoClickerSettings
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>
  runtimeError: string | null
}

export function SettingsPanelContent({
  disabledDependencyCue,
  layout = "default",
  settings,
  setSettings,
  runtimeError,
}: SettingsPanelContentProps) {
  const hotkeyId = useId()
  const rateId = useId()
  const rateUnitId = useId()
  const ignoreNextHotkeyTriggerClickRef = useRef(false)
  const rateUnitDropdownRef = useRef<HTMLDivElement | null>(null)

  const [isCapturingHotkey, setIsCapturingHotkey] = useState(false)
  const [isRateUnitDropdownOpen, setIsRateUnitDropdownOpen] = useState(false)
  const [activeDependencyHighlight, setActiveDependencyHighlight] = useState<{
    flashOn: boolean
    target: DisabledDependencyTarget
  } | null>(null)

  const {
    clickMode,
    clickRate,
    clickRateMode,
    clickRateUnit,
    hotkey,
    mouseAction,
    mouseButton,
  } = settings
  const isCompact = layout === "compact"
  const rateUnits = getClickRateUnitsForMode(clickRateMode)
  const clickRatePhrase =
    clickRateMode === "every" ? "Every" : "Clicks per"
  const isActionHoldHighlighted =
    activeDependencyHighlight?.target === "mouse-action-hold" &&
    activeDependencyHighlight.flashOn
  const isClickModeHoldHighlighted =
    activeDependencyHighlight?.target === "click-mode-hold" &&
    activeDependencyHighlight.flashOn

  function cycleMouseButton() {
    setSettings((current) => {
      const currentIndex = mouseButtons.indexOf(current.mouseButton)
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % mouseButtons.length : 0

      return {
        ...current,
        mouseButton: mouseButtons[nextIndex],
      }
    })
  }

  function cycleClickRateUnit() {
    setIsRateUnitDropdownOpen(false)
    setSettings((current) => {
      const nextRateUnits = getClickRateUnitsForMode(current.clickRateMode)
      const currentIndex = nextRateUnits.indexOf(current.clickRateUnit)
      const nextIndex =
        currentIndex >= 0 ? (currentIndex + 1) % nextRateUnits.length : 0

      return {
        ...current,
        clickRateUnit: nextRateUnits[nextIndex] ?? "s",
      }
    })
  }

  function setClickRateMode(nextMode: ClickRateMode) {
    setSettings((current) => {
      const nextUnits = getClickRateUnitsForMode(nextMode)
      const nextDefaultUnit = nextUnits[0] ?? "s"

      return {
        ...current,
        clickRateMode: nextMode,
        clickRateUnit: isCompact
          ? nextDefaultUnit
          : nextUnits.includes(current.clickRateUnit)
            ? current.clickRateUnit
            : nextDefaultUnit,
      }
    })
  }

  useEffect(() => {
    if (!isCapturingHotkey) {
      return undefined
    }

    let pendingMouseHotkey: AutoClickerSettings["hotkey"] | null = null

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        setSettings((current) => ({
          ...current,
          hotkey: { ...UNBOUND_HOTKEY },
        }))
        setIsCapturingHotkey(false)
        return
      }

      if (
        event.key === "Shift" ||
        event.key === "Control" ||
        event.key === "Alt" ||
        event.key === "Meta"
      ) {
        event.preventDefault()
        event.stopPropagation()
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
      if (
        event.target instanceof Element &&
        event.target.closest("[data-hotkey-trigger]")
      ) {
        ignoreNextHotkeyTriggerClickRef.current = true
      }

      const nextHotkey = formatMouseHotkey(event)
      if (!nextHotkey) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      pendingMouseHotkey = nextHotkey
    }

    function handleMouseUp(event: MouseEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-hotkey-trigger]")
      ) {
        ignoreNextHotkeyTriggerClickRef.current = true
      }

      if (!pendingMouseHotkey) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (event.buttons !== 0) {
        return
      }

      setSettings((current) => ({ ...current, hotkey: pendingMouseHotkey! }))
      setIsCapturingHotkey(false)
    }

    function handleContextMenu(event: MouseEvent) {
      event.preventDefault()
      event.stopPropagation()
    }

    function handleMouseClick(event: MouseEvent) {
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("mousedown", handleMouseDown, true)
    window.addEventListener("mouseup", handleMouseUp, true)
    window.addEventListener("click", handleMouseClick, true)
    window.addEventListener("auxclick", handleMouseClick, true)
    window.addEventListener("contextmenu", handleContextMenu, true)

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("mousedown", handleMouseDown, true)
      window.removeEventListener("mouseup", handleMouseUp, true)
      window.removeEventListener("click", handleMouseClick, true)
      window.removeEventListener("auxclick", handleMouseClick, true)
      window.removeEventListener("contextmenu", handleContextMenu, true)
    }
  }, [isCapturingHotkey, setSettings])

  useEffect(() => {
    if (!isCapturingHotkey || !isTauri()) {
      return undefined
    }

    let cancelled = false
    let pendingNativeHotkey: AutoClickerSettings["hotkey"] | null = null
    let pollInFlight = false

    async function pollPressedKeyboardHotkey() {
      if (cancelled || pollInFlight) {
        return
      }

      pollInFlight = true

      try {
        const nextHotkey = await readPressedKeyboardHotkey()
        if (cancelled) {
          return
        }

        if (nextHotkey) {
          pendingNativeHotkey = nextHotkey
          return
        }

        if (!pendingNativeHotkey) {
          return
        }

        setSettings((current) => ({
          ...current,
          hotkey: pendingNativeHotkey!,
        }))
        setIsCapturingHotkey(false)
      } catch (error) {
        console.error("Unable to read native hotkey state", error)
      } finally {
        pollInFlight = false
      }
    }

    void pollPressedKeyboardHotkey()

    const intervalId = window.setInterval(() => {
      void pollPressedKeyboardHotkey()
    }, 16)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isCapturingHotkey, setSettings])

  useEffect(() => {
    if (!disabledDependencyCue) {
      return undefined
    }

    let flashOn = true
    let completedFlashes = 0

    setActiveDependencyHighlight({
      flashOn: true,
      target: disabledDependencyCue.target,
    })

    const intervalId = window.setInterval(() => {
      completedFlashes += 1

      if (completedFlashes >= 12) {
        window.clearInterval(intervalId)
        setActiveDependencyHighlight(null)
        return
      }

      flashOn = !flashOn
      setActiveDependencyHighlight({
        flashOn,
        target: disabledDependencyCue.target,
      })
    }, 260)

    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId)
      setActiveDependencyHighlight(null)
    }, 3_200)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [disabledDependencyCue])

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

  if (isCompact) {
    return (
      <div className="grid w-max content-start gap-2 px-2.5 py-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <TinyLabel>Rate</TinyLabel>
            <Label className="sr-only" htmlFor={rateId}>
              Click rate
            </Label>
            <Input
              className="h-8 w-18 bg-background/70 px-2 text-center text-base font-semibold"
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
            <ToggleGroup
              className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
              onValueChange={(value) => {
                if (value) {
                  setClickRateMode(value as ClickRateMode)
                }
              }}
              size="sm"
              type="single"
              value={clickRateMode}
              variant="default"
            >
              {clickRateModes.map((value) => (
                <ToggleGroupItem
                  aria-label={`Set click rate mode to ${clickRateModeLabels[value]}`}
                  className="px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0"
                  key={value}
                  value={value}
                >
                  {clickRateModeLabels[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Label className="sr-only" htmlFor={rateUnitId}>
              Click rate unit
            </Label>
            <Button
              aria-label="Cycle click rate unit"
              className="h-8 w-[8.5rem] justify-center rounded-lg bg-background/70 px-3 text-sm font-medium focus-visible:ring-0"
              id={rateUnitId}
              onClick={cycleClickRateUnit}
              size="sm"
              type="button"
              variant="outline"
            >
              {clickRateUnitLabels[clickRateUnit]}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <TinyLabel>Hotkey</TinyLabel>
            <Button
              className="h-8 w-[9rem] justify-start rounded-lg bg-background/70 px-3 text-sm focus-visible:ring-0"
              data-hotkey-trigger
              id={hotkeyId}
              onClick={() => {
                if (ignoreNextHotkeyTriggerClickRef.current) {
                  ignoreNextHotkeyTriggerClickRef.current = false
                  return
                }

                setIsCapturingHotkey(true)
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {isCapturingHotkey || hotkey.code === ""
                ? "Press any key"
                : hotkey.label}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <TinyLabel>Action</TinyLabel>
            <ToggleGroup
              className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
              onValueChange={(value) => {
                if (value) {
                  setSettings((current) => ({
                    ...current,
                    mouseAction: value as MouseActionOption,
                  }))
                }
              }}
              size="sm"
              type="single"
              value={mouseAction}
              variant="default"
            >
              {mouseActions.map((value) => (
                <ToggleGroupItem
                  aria-label={`Set mouse action to ${mouseActionLabels[value]}`}
                  className={cn(
                    "px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0",
                    value === "hold" &&
                      isActionHoldHighlighted &&
                      "!bg-white !text-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_0_18px_rgba(255,255,255,0.28)]"
                  )}
                  key={value}
                  value={value}
                >
                  {mouseActionLabels[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex items-center gap-2">
            <TinyLabel>Button</TinyLabel>
            <Button
              aria-label="Cycle mouse button"
              className="h-8 min-w-[6.75rem] justify-center rounded-lg bg-background/70 px-3 text-sm font-medium focus-visible:ring-0"
              onClick={cycleMouseButton}
              size="sm"
              type="button"
              variant="outline"
            >
              {mouseButtonLabels[mouseButton]}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <TinyLabel>Activate</TinyLabel>
            <ToggleGroup
              className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
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
                  className={cn(
                    "px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0",
                    value === "hold" &&
                      isClickModeHoldHighlighted &&
                      "!bg-white !text-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_0_18px_rgba(255,255,255,0.28)]"
                  )}
                  key={value}
                  value={value}
                >
                  {value === "toggle" ? "Toggle" : "Hold"}
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
            {clickRatePhrase}
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
              onClick={() => setIsRateUnitDropdownOpen((current) => !current)}
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
                  {rateUnits.map((value) => {
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
                            clickRateUnit: value,
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
          <ToggleGroup
            className="shrink-0 overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
            onValueChange={(value) => {
              if (value) {
                setClickRateMode(value as ClickRateMode)
              }
            }}
            size="sm"
            type="single"
            value={clickRateMode}
            variant="default"
          >
            {clickRateModes.map((value) => (
              <ToggleGroupItem
                aria-label={`Set click rate mode to ${clickRateModeLabels[value]}`}
                className="px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0"
                key={value}
                value={value}
              >
                {clickRateModeLabels[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="w-14 shrink-0">
            <TinyLabel>Hotkey</TinyLabel>
          </div>
          <Button
            className="h-8 w-[14rem] max-w-full justify-start rounded-lg bg-background/70 px-3 text-sm focus-visible:ring-0"
            data-hotkey-trigger
            id={hotkeyId}
            onClick={() => {
              if (ignoreNextHotkeyTriggerClickRef.current) {
                ignoreNextHotkeyTriggerClickRef.current = false
                return
              }

              setIsCapturingHotkey(true)
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {isCapturingHotkey || hotkey.code === ""
              ? "Press any key"
              : hotkey.label}
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <TinyLabel>Activate</TinyLabel>
          <ToggleGroup
            className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
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
                className={cn(
                  "px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0",
                  value === "hold" &&
                    isClickModeHoldHighlighted &&
                    "!bg-white !text-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_0_18px_rgba(255,255,255,0.28)]"
                )}
                key={value}
                value={value}
              >
                {value === "toggle" ? "Toggle" : "Hold"}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex shrink-0 items-center gap-2">
          <TinyLabel>Action</TinyLabel>
          <ToggleGroup
            className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
            onValueChange={(value) => {
              if (value) {
                setSettings((current) => ({
                  ...current,
                  mouseAction: value as MouseActionOption,
                }))
              }
            }}
            size="sm"
            type="single"
            value={mouseAction}
            variant="default"
          >
            {mouseActions.map((value) => (
              <ToggleGroupItem
                aria-label={`Set mouse action to ${mouseActionLabels[value]}`}
                className={cn(
                  "px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0",
                  value === "hold" &&
                    isActionHoldHighlighted &&
                    "!bg-white !text-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_0_18px_rgba(255,255,255,0.28)]"
                )}
                key={value}
                value={value}
              >
                {mouseActionLabels[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <TinyLabel>Button</TinyLabel>
          <ToggleGroup
            className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
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
                aria-label={`Set mouse button to ${mouseButtonLabels[value]}`}
                className="px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0"
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
