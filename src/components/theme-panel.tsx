import type { Dispatch, SetStateAction } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { CheckIcon, ChevronDownIcon, RotateCcwIcon } from "lucide-react";

import { CustomColorPicker } from "@/components/custom-color-picker";
import { WindowOpacityPanel } from "@/components/window-opacity-panel";
import type { AutoClickerSettings } from "@/config/settings";
import {
  areThemeColorsEqual,
  cloneThemeColors,
  defaultThemeColors,
  defaultThemePresetId,
  deriveThemeModeFromColors,
  editableThemeColorKeys,
  themeColorDescriptions,
  themeColorLabels,
  themePresets,
  themePresetsById,
  type ThemeColorKey,
} from "@/config/theme";
import { Button } from "@tauri-ui/components/ui/button";
import { cn } from "@tauri-ui/lib/utils";

const EDGE_STOP_THEME_KEYS = new Set<ThemeColorKey>([
  "edgeStopFill",
  "edgeStopLine",
]);

const MAIN_THEME_KEYS: ThemeColorKey[] = editableThemeColorKeys.filter(
  (key) => !EDGE_STOP_THEME_KEYS.has(key),
);
const EDGE_STOP_KEYS: ThemeColorKey[] = ["edgeStopFill", "edgeStopLine"];
const EDGE_STOP_PREVIEW_HIDE_DELAY_MS = 850;

type ThemePanelProps = {
  onEdgeStopPreviewActiveChange?: (active: boolean) => void;
  settings: AutoClickerSettings;
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>;
};

function ThemeColorEditor({
  description,
  label,
  onChange,
  onOpenChange,
  onReset,
  value,
}: {
  description: string;
  label: string;
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  onReset: () => void;
  value: string;
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-border/65 bg-background/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        <Button
          className="h-8 shrink-0 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
          onClick={onReset}
          size="sm"
          type="button"
          variant="outline"
        >
          <RotateCcwIcon className="size-3.5" />
          <span>Reset</span>
        </Button>
      </div>

      <CustomColorPicker
        onChange={onChange}
        onOpenChange={onOpenChange}
        value={value}
      />
    </div>
  );
}

export function ThemePanel({
  onEdgeStopPreviewActiveChange,
  settings,
  setSettings,
}: ThemePanelProps) {
  const sectionId = useId();
  const openEdgeStopPickersRef = useRef<Set<ThemeColorKey>>(new Set());
  const previewHideTimeoutRef = useRef<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isContentMounted, setIsContentMounted] = useState(false);
  const [isContentVisible, setIsContentVisible] = useState(false);

  const activePresetId = settings.themeCustomColorsEnabled
    ? null
    : settings.themePreset;
  const presetColors = themePresetsById[settings.themePreset].colors;
  const customizedColorCount = editableThemeColorKeys.filter(
    (key) => settings.themeColors[key] !== presetColors[key],
  ).length;

  useEffect(() => {
    if (isExpanded) {
      setIsContentMounted(true);
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isContentMounted) {
      setIsContentVisible(false);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsContentVisible(isExpanded);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isContentMounted, isExpanded]);

  useEffect(() => {
    return () => {
      if (previewHideTimeoutRef.current !== null) {
        window.clearTimeout(previewHideTimeoutRef.current);
      }

      openEdgeStopPickersRef.current.clear();
      onEdgeStopPreviewActiveChange?.(false);
    };
  }, [onEdgeStopPreviewActiveChange]);

  function clearEdgeStopPreviewHideTimer() {
    if (previewHideTimeoutRef.current !== null) {
      window.clearTimeout(previewHideTimeoutRef.current);
      previewHideTimeoutRef.current = null;
    }
  }

  function setEdgeStopPreviewActive(active: boolean) {
    if (active) {
      clearEdgeStopPreviewHideTimer();
    }

    onEdgeStopPreviewActiveChange?.(active);
  }

  function scheduleEdgeStopPreviewHide() {
    clearEdgeStopPreviewHideTimer();
    previewHideTimeoutRef.current = window.setTimeout(() => {
      if (openEdgeStopPickersRef.current.size > 0) {
        previewHideTimeoutRef.current = null;
        return;
      }

      previewHideTimeoutRef.current = null;
      onEdgeStopPreviewActiveChange?.(false);
    }, EDGE_STOP_PREVIEW_HIDE_DELAY_MS);
  }

  function updateThemeColors(
    updater: (
      colors: AutoClickerSettings["themeColors"],
    ) => AutoClickerSettings["themeColors"],
  ) {
    setSettings((current) => {
      const nextColors = updater(current.themeColors);
      const basePresetColors = themePresetsById[current.themePreset].colors;
      const customColorsEnabled = !areThemeColorsEqual(
        nextColors,
        basePresetColors,
      );

      return {
        ...current,
        theme: customColorsEnabled
          ? deriveThemeModeFromColors(nextColors)
          : themePresetsById[current.themePreset].mode,
        themeColors: customColorsEnabled
          ? nextColors
          : cloneThemeColors(basePresetColors),
        themeCustomColorsEnabled: customColorsEnabled,
      };
    });
  }

  function applyPreset(presetId: AutoClickerSettings["themePreset"]) {
    const preset = themePresetsById[presetId];
    clearEdgeStopPreviewHideTimer();
    onEdgeStopPreviewActiveChange?.(false);

    setSettings((current) => ({
      ...current,
      theme: preset.mode,
      themeColors: cloneThemeColors(preset.colors),
      themeCustomColorsEnabled: false,
      themePreset: presetId,
    }));
  }

  function updateThemeColor(key: ThemeColorKey, value: string) {
    if (EDGE_STOP_THEME_KEYS.has(key)) {
      setEdgeStopPreviewActive(true);
      scheduleEdgeStopPreviewHide();
    }

    updateThemeColors((currentColors) => ({
      ...currentColors,
      [key]: value,
    }));
  }

  function resetThemeColor(key: ThemeColorKey) {
    if (EDGE_STOP_THEME_KEYS.has(key)) {
      setEdgeStopPreviewActive(true);
      scheduleEdgeStopPreviewHide();
    }

    updateThemeColors((currentColors) => ({
      ...currentColors,
      [key]: themePresetsById[settings.themePreset].colors[key],
    }));
  }

  function resetThemeToDefault() {
    clearEdgeStopPreviewHideTimer();
    onEdgeStopPreviewActiveChange?.(false);

    setSettings((current) => ({
      ...current,
      theme: themePresetsById[defaultThemePresetId].mode,
      themeColors: cloneThemeColors(defaultThemeColors),
      themeCustomColorsEnabled: false,
      themePreset: defaultThemePresetId,
    }));
  }

  function handlePickerOpenChange(key: ThemeColorKey, open: boolean) {
    if (!EDGE_STOP_THEME_KEYS.has(key)) {
      return;
    }

    if (open) {
      openEdgeStopPickersRef.current.add(key);
      setEdgeStopPreviewActive(true);
      return;
    }

    openEdgeStopPickersRef.current.delete(key);
    scheduleEdgeStopPreviewHide();
  }

  return (
    <section className="grid gap-3 rounded-xl border border-border/70 bg-card/35 px-3 py-3 transition-colors md:col-span-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">Themes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a preset fast, then open the editor if you want to tune colors
            yourself.
          </p>
          {settings.themeCustomColorsEnabled ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Custom colors are active. Choose a preset again any time to
              replace the custom palette.
            </p>
          ) : null}
        </div>

        <Button
          className="h-9 shrink-0 px-3 text-[11px] font-semibold uppercase tracking-[0.16em]"
          onClick={resetThemeToDefault}
          type="button"
          variant="outline"
        >
          <RotateCcwIcon className="size-3.5" />
          <span>Reset Default</span>
        </Button>
      </div>

      <div className="grid gap-2 lg:grid-cols-4">
        {themePresets.map((preset) => {
          const isActive = activePresetId === preset.id;

          return (
            <button
              className={cn(
                "grid gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-0",
                isActive
                  ? "border-border bg-background/78 text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                  : "border-border/65 bg-background/40 text-foreground hover:bg-background/60",
              )}
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{preset.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {preset.description}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                    isActive
                      ? "border-border bg-muted-foreground/14 text-foreground"
                      : "border-border/70 text-transparent",
                  )}
                >
                  <CheckIcon className="size-3.5" />
                </span>
              </div>

              <div className="flex items-center gap-2">
                {(
                  [
                    preset.colors.background,
                    preset.colors.panel,
                    preset.colors.accent,
                  ] as const
                ).map((colorValue, index) => (
                  <span
                    aria-hidden="true"
                    className="h-7 flex-1 rounded-lg border"
                    key={`${preset.id}:${index}`}
                    style={{
                      backgroundColor: colorValue,
                      borderColor: `${preset.colors.panelBorder}CC`,
                    }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <button
        aria-controls={sectionId}
        aria-expanded={isExpanded}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border px-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-0",
          settings.themeCustomColorsEnabled
            ? "border-border/70 bg-background/60 text-foreground hover:bg-background/85"
            : "border-border/60 bg-background/40 text-muted-foreground hover:bg-background/65 hover:text-foreground",
        )}
        onClick={() => setIsExpanded((current) => !current)}
        type="button"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em]">
            Theme Customization
          </span>
          <span className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[10px] leading-none text-muted-foreground">
            {customizedColorCount} tweaked
          </span>
          <span
            className={cn(
              "rounded-md px-2 py-1 text-[10px] leading-none",
              settings.themeCustomColorsEnabled
                ? "bg-muted-foreground/15 text-foreground"
                : "text-muted-foreground",
            )}
          >
            {settings.themeCustomColorsEnabled ? "Custom" : "Preset"}
          </span>
        </div>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-200 ease-out",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {isContentMounted ? (
        <div
          aria-hidden={!isContentVisible}
          className={cn(
            "grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-200 ease-out motion-reduce:transition-none",
            isContentVisible
              ? "mt-0 grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
          onTransitionEnd={(event) => {
            if (
              event.target !== event.currentTarget ||
              isExpanded ||
              isContentVisible
            ) {
              return;
            }

            setIsContentMounted(false);
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="grid gap-4 pt-3" id={sectionId}>
              <WindowOpacityPanel setSettings={setSettings} settings={settings} />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)]">
                <div className="grid gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      App Colors
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Panel, border, and text colors also flow into the window
                      picker overlay used for whitelist and blacklist selection.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {MAIN_THEME_KEYS.map((key) => (
                      <ThemeColorEditor
                        description={themeColorDescriptions[key]}
                        key={key}
                        label={themeColorLabels[key]}
                        onChange={(value) => updateThemeColor(key, value)}
                        onReset={() => resetThemeColor(key)}
                        value={settings.themeColors[key]}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid content-start gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Edge Stop Overlay
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Opening or editing these colors shows a temporary overlay
                      preview without turning edge stop on.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {EDGE_STOP_KEYS.map((key) => (
                      <ThemeColorEditor
                        description={themeColorDescriptions[key]}
                        key={key}
                        label={themeColorLabels[key]}
                        onChange={(value) => updateThemeColor(key, value)}
                        onOpenChange={(open) =>
                          handlePickerOpenChange(key, open)
                        }
                        onReset={() => resetThemeColor(key)}
                        value={settings.themeColors[key]}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
