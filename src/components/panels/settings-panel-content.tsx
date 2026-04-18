import type { Dispatch, SetStateAction } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { CheckIcon, ChevronDownIcon } from "lucide-react";

import {
  ClickPositionDescriptionTooltip,
  InlineClickPositionControls,
  type ClickPositionControlCallbacks,
} from "@/components/click-position-panel";
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
} from "@/config/settings";
import type {
  DisabledDependencyCue,
  DisabledDependencyTarget,
} from "@/components/disabled-feature-dependency";
import type { SettingsPanelLayout } from "@/components/settings-panel";
import { finalizeClickRate, normalizeClickRateInput } from "@/config/runtime";
import {
  buildHotkeyFromCaptureCodes,
  hotkeyCaptureCodeFromKeyboardEvent,
  hotkeyCaptureCodeFromMouseButton,
  isModifierHotkeyCode,
  UNBOUND_HOTKEY,
} from "@/input/hotkeys";
import { readPressedKeyboardHotkey } from "@/lib/hotkey-capture";
import { isTauri } from "@/lib/tauri";
import { Button } from "@tauri-ui/components/ui/button";
import { Input } from "@tauri-ui/components/ui/input";
import { Label } from "@tauri-ui/components/ui/label";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@tauri-ui/components/ui/toggle-group";
import { cn } from "@tauri-ui/lib/utils";

function TinyLabel({ children }: { children: string }) {
  return (
    <Label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </Label>
  );
}

type SettingsPanelContentProps = {
  clickPositionControls?: ClickPositionControlCallbacks;
  disabledDependencyCue: DisabledDependencyCue | null;
  layout?: SettingsPanelLayout;
  onDisabledDependencyCueConsumed?: () => void;
  settings: AutoClickerSettings;
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>;
  runtimeError: string | null;
};

export function SettingsPanelContent({
  clickPositionControls,
  disabledDependencyCue,
  layout = "default",
  onDisabledDependencyCueConsumed,
  settings,
  setSettings,
  runtimeError,
}: SettingsPanelContentProps) {
  const hotkeyId = useId();
  const clickPositionSectionId = useId();
  const rateId = useId();
  const rateUnitId = useId();
  const ignoreNextHotkeyTriggerClickRef = useRef(false);
  const hotkeyTriggerIgnoreTimeoutRef = useRef<number | null>(null);
  const hotkeyCaptureUsedMouseRef = useRef(false);
  const hotkeyCaptureUsedKeyboardRef = useRef(false);
  const rateUnitDropdownRef = useRef<HTMLDivElement | null>(null);

  const [isCapturingHotkey, setIsCapturingHotkey] = useState(false);
  const [isClickPositionSectionExpanded, setIsClickPositionSectionExpanded] =
    useState(false);
  const [isClickPositionContentMounted, setIsClickPositionContentMounted] =
    useState(false);
  const [isClickPositionContentVisible, setIsClickPositionContentVisible] =
    useState(false);
  const [isRateUnitDropdownOpen, setIsRateUnitDropdownOpen] = useState(false);
  const [queuedDependencyCue, setQueuedDependencyCue] =
    useState<DisabledDependencyCue | null>(null);
  const [activeDependencyHighlight, setActiveDependencyHighlight] = useState<{
    flashOn: boolean;
    target: DisabledDependencyTarget;
  } | null>(null);

  const {
    clickMode,
    clickRate,
    clickRateMode,
    clickRateUnit,
    hotkey,
    mouseAction,
    mouseButton,
  } = settings;
  const isCompact = layout === "compact";
  const rateUnits = getClickRateUnitsForMode(clickRateMode);
  const clickRatePhrase = clickRateMode === "every" ? "Every" : "Clicks per";
  const clickPositionDotCount = settings.clickPositions.length;
  const clickPositionDotLabel = `${clickPositionDotCount} dot${
    clickPositionDotCount === 1 ? "" : "s"
  }`;
  const isClickPositionActive =
    settings.mouseAction === "click" && settings.clickPositionEnabled;
  const isHotkeyUnbound = hotkey.code === "";
  const hotkeyTriggerClassName = cn(
    "justify-start rounded-lg bg-background/70 px-3 text-sm focus-visible:ring-0",
    isHotkeyUnbound && !isCapturingHotkey && "text-muted-foreground/85",
    isCapturingHotkey &&
      "border-white/60 bg-white/10 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_0_22px_rgba(255,255,255,0.11)]",
  );
  const isActionHoldHighlighted =
    activeDependencyHighlight?.target === "mouse-action-hold" &&
    activeDependencyHighlight.flashOn;
  const isClickModeHoldHighlighted =
    activeDependencyHighlight?.target === "click-mode-hold" &&
    activeDependencyHighlight.flashOn;
  const dependencyHighlightClassName =
    "!bg-zinc-950 !text-white shadow-[0_0_0_1px_rgba(24,24,27,0.95),0_0_18px_rgba(24,24,27,0.2)] dark:!bg-white dark:!text-zinc-950 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_0_18px_rgba(255,255,255,0.28)]";

  useEffect(() => {
    if (isClickPositionSectionExpanded) {
      setIsClickPositionContentMounted(true);
    }
  }, [isClickPositionSectionExpanded]);

  useEffect(() => {
    if (!isClickPositionContentMounted) {
      setIsClickPositionContentVisible(false);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsClickPositionContentVisible(isClickPositionSectionExpanded);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isClickPositionContentMounted, isClickPositionSectionExpanded]);

  function clearHotkeyTriggerClickIgnore() {
    ignoreNextHotkeyTriggerClickRef.current = false;

    if (hotkeyTriggerIgnoreTimeoutRef.current !== null) {
      window.clearTimeout(hotkeyTriggerIgnoreTimeoutRef.current);
      hotkeyTriggerIgnoreTimeoutRef.current = null;
    }
  }

  function armHotkeyTriggerClickIgnore() {
    clearHotkeyTriggerClickIgnore();
    ignoreNextHotkeyTriggerClickRef.current = true;
    hotkeyTriggerIgnoreTimeoutRef.current = window.setTimeout(() => {
      ignoreNextHotkeyTriggerClickRef.current = false;
      hotkeyTriggerIgnoreTimeoutRef.current = null;
    }, 250);
  }

  function cycleMouseButton() {
    setSettings((current) => {
      const currentIndex = mouseButtons.indexOf(current.mouseButton);
      const nextIndex =
        currentIndex >= 0 ? (currentIndex + 1) % mouseButtons.length : 0;

      return {
        ...current,
        mouseButton: mouseButtons[nextIndex],
      };
    });
  }

  function cycleClickRateUnit() {
    setIsRateUnitDropdownOpen(false);
    setSettings((current) => {
      const nextRateUnits = getClickRateUnitsForMode(current.clickRateMode);
      const currentIndex = nextRateUnits.indexOf(current.clickRateUnit);
      const nextIndex =
        currentIndex >= 0 ? (currentIndex + 1) % nextRateUnits.length : 0;

      return {
        ...current,
        clickRateUnit: nextRateUnits[nextIndex] ?? "s",
      };
    });
  }

  function setClickRateMode(nextMode: ClickRateMode) {
    setSettings((current) => {
      const nextUnits = getClickRateUnitsForMode(nextMode);
      const nextDefaultUnit = nextUnits[0] ?? "s";

      return {
        ...current,
        clickRateMode: nextMode,
        clickRateUnit: isCompact
          ? nextDefaultUnit
          : nextUnits.includes(current.clickRateUnit)
            ? current.clickRateUnit
            : nextDefaultUnit,
      };
    });
  }

  function renderHotkeyTriggerContent() {
    if (isCapturingHotkey) {
      return (
        <span className="flex items-center gap-2 font-medium">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-white/95 shadow-[0_0_10px_rgba(255,255,255,0.55)] animate-pulse"
          />
          <span>Listening...</span>
        </span>
      );
    }

    if (isHotkeyUnbound) {
      return "Press any key";
    }

    return hotkey.label;
  }

  useEffect(() => {
    return () => {
      clearHotkeyTriggerClickIgnore();
    };
  }, []);

  useEffect(() => {
    if (!isCapturingHotkey) {
      return undefined;
    }

    hotkeyCaptureUsedMouseRef.current = false;
    hotkeyCaptureUsedKeyboardRef.current = false;

    let pendingHotkey: AutoClickerSettings["hotkey"] | null = null;
    let capturedHotkeyCodes: string[] = [];
    let pressedKeyboardCodes: string[] = [];
    let pressedMouseButtons: number[] = [];

    function rememberPressedKeyboardCode(code: string) {
      if (pressedKeyboardCodes.includes(code)) {
        return;
      }

      pressedKeyboardCodes = [...pressedKeyboardCodes, code];
    }

    function forgetPressedKeyboardCode(code: string) {
      pressedKeyboardCodes = pressedKeyboardCodes.filter(
        (pressedCode) => pressedCode !== code,
      );
    }

    function rememberCapturedHotkeyCode(code: string) {
      if (capturedHotkeyCodes.includes(code)) {
        return;
      }

      capturedHotkeyCodes = [...capturedHotkeyCodes, code];
    }

    function rememberPressedMouseButton(button: number) {
      if (pressedMouseButtons.includes(button)) {
        return;
      }

      pressedMouseButtons = [...pressedMouseButtons, button];
    }

    function forgetPressedMouseButton(button: number) {
      pressedMouseButtons = pressedMouseButtons.filter(
        (pressedButton) => pressedButton !== button,
      );
    }

    function updatePendingHotkey(
      nextHotkey: AutoClickerSettings["hotkey"] | null,
    ) {
      if (nextHotkey) {
        pendingHotkey = nextHotkey;
      }
    }

    function finalizePendingHotkeyIfIdle() {
      if (!pendingHotkey) {
        return;
      }

      const hasActiveNonModifierKeyboardKey = pressedKeyboardCodes.some(
        (code) => !isModifierHotkeyCode(code),
      );
      if (hasActiveNonModifierKeyboardKey || pressedMouseButtons.length > 0) {
        return;
      }

      setSettings((current) => ({ ...current, hotkey: pendingHotkey! }));
      setIsCapturingHotkey(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSettings((current) => ({
          ...current,
          hotkey: { ...UNBOUND_HOTKEY },
        }));
        setIsCapturingHotkey(false);
        return;
      }

      const captureCode = hotkeyCaptureCodeFromKeyboardEvent(event);
      if (!captureCode) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (!isModifierHotkeyCode(captureCode)) {
        hotkeyCaptureUsedKeyboardRef.current = true;
      }

      rememberPressedKeyboardCode(captureCode);
      rememberCapturedHotkeyCode(captureCode);
      updatePendingHotkey(buildHotkeyFromCaptureCodes(capturedHotkeyCodes));
    }

    function handleKeyUp(event: KeyboardEvent) {
      const captureCode = hotkeyCaptureCodeFromKeyboardEvent(event);
      if (!captureCode) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      forgetPressedKeyboardCode(captureCode);
      finalizePendingHotkeyIfIdle();
    }

    function handleMouseDown(event: MouseEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-hotkey-trigger]")
      ) {
        armHotkeyTriggerClickIgnore();
      }

      hotkeyCaptureUsedMouseRef.current = true;
      rememberPressedMouseButton(event.button);

      event.preventDefault();
      event.stopPropagation();

      const captureCode = hotkeyCaptureCodeFromMouseButton(event.button);
      if (captureCode) {
        rememberCapturedHotkeyCode(captureCode);
      }

      updatePendingHotkey(buildHotkeyFromCaptureCodes(capturedHotkeyCodes));
    }

    function handleMouseUp(event: MouseEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-hotkey-trigger]")
      ) {
        armHotkeyTriggerClickIgnore();
      }

      event.preventDefault();
      event.stopPropagation();

      hotkeyCaptureUsedMouseRef.current = true;
      forgetPressedMouseButton(event.button);
      finalizePendingHotkeyIfIdle();
    }

    function handleContextMenu(event: MouseEvent) {
      event.preventDefault();
      event.stopPropagation();
    }

    function handleMouseClick(event: MouseEvent) {
      event.preventDefault();
      event.stopPropagation();
    }

    function handleWheel(event: WheelEvent) {
      hotkeyCaptureUsedMouseRef.current = true;
      const wheelCaptureCode =
        event.deltaY < 0 ? "WheelUp" : event.deltaY > 0 ? "WheelDown" : null;
      if (wheelCaptureCode) {
        rememberCapturedHotkeyCode(wheelCaptureCode);
      }

      const nextHotkey = buildHotkeyFromCaptureCodes(capturedHotkeyCodes);
      if (!nextHotkey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSettings((current) => ({ ...current, hotkey: nextHotkey }));
      setIsCapturingHotkey(false);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("click", handleMouseClick, true);
    window.addEventListener("auxclick", handleMouseClick, true);
    window.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });

    return () => {
      hotkeyCaptureUsedMouseRef.current = false;
      hotkeyCaptureUsedKeyboardRef.current = false;
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("click", handleMouseClick, true);
      window.removeEventListener("auxclick", handleMouseClick, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("wheel", handleWheel, true);
    };
  }, [isCapturingHotkey, setSettings]);

  useEffect(() => {
    if (!isCapturingHotkey || !isTauri()) {
      return undefined;
    }

    let cancelled = false;
    let pendingNativeHotkey: AutoClickerSettings["hotkey"] | null = null;
    let pollInFlight = false;

    async function pollPressedKeyboardHotkey() {
      if (
        cancelled ||
        pollInFlight ||
        hotkeyCaptureUsedMouseRef.current ||
        hotkeyCaptureUsedKeyboardRef.current
      ) {
        pendingNativeHotkey = null;
        return;
      }

      pollInFlight = true;

      try {
        const nextHotkey = await readPressedKeyboardHotkey();
        if (cancelled) {
          return;
        }

        if (nextHotkey) {
          pendingNativeHotkey = nextHotkey;
          return;
        }

        if (!pendingNativeHotkey) {
          return;
        }

        setSettings((current) => ({
          ...current,
          hotkey: pendingNativeHotkey!,
        }));
        setIsCapturingHotkey(false);
      } catch (error) {
        console.error("Unable to read native hotkey state", error);
      } finally {
        pollInFlight = false;
      }
    }

    void pollPressedKeyboardHotkey();

    const intervalId = window.setInterval(() => {
      void pollPressedKeyboardHotkey();
    }, 16);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isCapturingHotkey, setSettings]);

  useEffect(() => {
    if (!disabledDependencyCue) {
      return undefined;
    }

    setQueuedDependencyCue(disabledDependencyCue);
    onDisabledDependencyCueConsumed?.();
  }, [disabledDependencyCue, onDisabledDependencyCueConsumed]);

  useEffect(() => {
    if (!queuedDependencyCue) {
      return undefined;
    }

    let flashOn = true;
    let completedFlashes = 0;

    setActiveDependencyHighlight({
      flashOn: true,
      target: queuedDependencyCue.target,
    });

    const intervalId = window.setInterval(() => {
      completedFlashes += 1;

      if (completedFlashes >= 12) {
        window.clearInterval(intervalId);
        setActiveDependencyHighlight(null);
        return;
      }

      flashOn = !flashOn;
      setActiveDependencyHighlight({
        flashOn,
        target: queuedDependencyCue.target,
      });
    }, 260);

    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      setActiveDependencyHighlight(null);
      setQueuedDependencyCue(null);
    }, 3_200);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [queuedDependencyCue]);

  useEffect(() => {
    if (!isRateUnitDropdownOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        rateUnitDropdownRef.current &&
        !rateUnitDropdownRef.current.contains(event.target as Node)
      ) {
        setIsRateUnitDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsRateUnitDropdownOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRateUnitDropdownOpen]);

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
                  setClickRateMode(value as ClickRateMode);
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
              className={cn("h-8 w-[9rem]", hotkeyTriggerClassName)}
              data-hotkey-trigger
              id={hotkeyId}
              onClick={() => {
                if (ignoreNextHotkeyTriggerClickRef.current) {
                  clearHotkeyTriggerClickIgnore();
                  return;
                }

                setIsCapturingHotkey(true);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {renderHotkeyTriggerContent()}
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
                  }));
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
                      dependencyHighlightClassName,
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
                  }));
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
                      dependencyHighlightClassName,
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
    );
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
                  : "rounded-lg",
              )}
              id={rateUnitId}
              onClick={() => setIsRateUnitDropdownOpen((current) => !current)}
              type="button"
            >
              <span>{clickRateUnitLabels[clickRateUnit]}</span>
              <ChevronDownIcon
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform duration-200",
                  isRateUnitDropdownOpen && "rotate-180",
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
                    const isSelected = value === clickRateUnit;

                    return (
                      <button
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
                          isSelected
                            ? "bg-muted-foreground/14 text-foreground"
                            : "text-foreground/88 hover:bg-muted-foreground/10",
                        )}
                        key={value}
                        onClick={() => {
                          setSettings((current) => ({
                            ...current,
                            clickRateUnit: value,
                          }));
                          setIsRateUnitDropdownOpen(false);
                        }}
                        role="option"
                        type="button"
                      >
                        <span>{clickRateUnitLabels[value]}</span>
                        <CheckIcon
                          className={cn(
                            "size-3.5 text-foreground/80 transition-opacity",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <ToggleGroup
            className="shrink-0 overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
            onValueChange={(value) => {
              if (value) {
                setClickRateMode(value as ClickRateMode);
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
            className={cn("h-8 w-[14rem] max-w-full", hotkeyTriggerClassName)}
            data-hotkey-trigger
            id={hotkeyId}
            onClick={() => {
              if (ignoreNextHotkeyTriggerClickRef.current) {
                clearHotkeyTriggerClickIgnore();
                return;
              }

              setIsCapturingHotkey(true);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {renderHotkeyTriggerContent()}
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
                }));
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
                    dependencyHighlightClassName,
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
                }));
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
                    dependencyHighlightClassName,
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
                }));
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

      {clickPositionControls ? (
        <div className="mt-1 border-t border-border/60 pt-3">
          {isClickPositionActive ? (
            <button
              aria-controls={clickPositionSectionId}
              aria-expanded={isClickPositionSectionExpanded}
              className={cn(
                "flex h-10 w-full items-center justify-between rounded-lg border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-0",
                isClickPositionActive || clickPositionDotCount > 0
                  ? "border-border/70 bg-background/60 text-foreground hover:bg-background/85"
                  : "border-border/60 bg-background/40 text-muted-foreground hover:bg-background/65 hover:text-foreground",
              )}
              onClick={() =>
                setIsClickPositionSectionExpanded((current) => !current)
              }
              type="button"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em]">
                  Click Positions
                </span>
                <span className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[10px] leading-none text-muted-foreground">
                  {clickPositionDotLabel}
                </span>
                <span
                  className={cn(
                    "rounded-md px-1 py-1 text-[10px] leading-none",
                    isClickPositionActive
                      ? "bg-muted-foreground/15 text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {isClickPositionActive ? "On" : "Off"}
                </span>
              </div>
              <ChevronDownIcon
                className={cn(
                  "size-3.5 shrink-0 transition-transform duration-200 ease-out",
                  isClickPositionSectionExpanded && "rotate-180",
                )}
              />
            </button>
          ) : (
            <ClickPositionDescriptionTooltip>
              <button
                aria-controls={clickPositionSectionId}
                aria-expanded={isClickPositionSectionExpanded}
                className={cn(
                  "flex h-10 w-full items-center justify-between rounded-lg border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-0",
                  isClickPositionActive || clickPositionDotCount > 0
                    ? "border-border/70 bg-background/60 text-foreground hover:bg-background/85"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:bg-background/65 hover:text-foreground",
                )}
                onClick={() =>
                  setIsClickPositionSectionExpanded((current) => !current)
                }
                type="button"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em]">
                    Click Positions
                  </span>
                  <span className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[10px] leading-none text-muted-foreground">
                    {clickPositionDotLabel}
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-1 py-1 text-[10px] leading-none",
                      isClickPositionActive
                        ? "bg-muted-foreground/15 text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {isClickPositionActive ? "On" : "Off"}
                  </span>
                </div>
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 shrink-0 transition-transform duration-200 ease-out",
                    isClickPositionSectionExpanded && "rotate-180",
                  )}
                />
              </button>
            </ClickPositionDescriptionTooltip>
          )}

          {isClickPositionContentMounted ? (
            <div
              aria-hidden={!isClickPositionContentVisible}
              className={cn(
                "grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-200 ease-out motion-reduce:transition-none",
                isClickPositionContentVisible
                  ? "mt-3 grid-rows-[1fr] opacity-100"
                  : "mt-0 grid-rows-[0fr] opacity-0",
              )}
              onTransitionEnd={(event) => {
                if (
                  event.target !== event.currentTarget ||
                  isClickPositionSectionExpanded ||
                  isClickPositionContentVisible
                ) {
                  return;
                }

                setIsClickPositionContentMounted(false);
              }}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="pb-1" id={clickPositionSectionId}>
                  <InlineClickPositionControls
                    onAddCenteredDot={clickPositionControls.onAddCenteredDot}
                    onClearDots={clickPositionControls.onClearDots}
                    onRemoveDot={clickPositionControls.onRemoveDot}
                    onUnavailablePress={(target) =>
                      setQueuedDependencyCue({ target })
                    }
                    setSettings={setSettings}
                    settings={settings}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
