import type { CSSProperties, Dispatch, SetStateAction } from "react";

import {
  MAX_WINDOW_OPACITY_PERCENT,
  MIN_WINDOW_OPACITY_PERCENT,
  normalizeWindowOpacityPercent,
} from "@/config/window-opacity";
import type { AutoClickerSettings } from "@/config/settings";

type WindowOpacityPanelProps = {
  settings: AutoClickerSettings;
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>;
};

export function WindowOpacityPanel({
  settings,
  setSettings,
}: WindowOpacityPanelProps) {
  const sliderFillPercent =
    ((settings.windowOpacity - MIN_WINDOW_OPACITY_PERCENT) /
      (MAX_WINDOW_OPACITY_PERCENT - MIN_WINDOW_OPACITY_PERCENT)) *
    100;

  return (
    <section className="grid gap-3 rounded-xl border border-border/70 bg-card/35 px-3 py-3 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pr-2">
          <p className="text-base font-semibold text-foreground">
            Window Opacity
          </p>
          <p className="text-sm text-muted-foreground">
            Controls how transparent the main app window looks.
          </p>
        </div>

        <span className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[11px] font-semibold text-foreground">
          {settings.windowOpacity}%
        </span>
      </div>

      <div className="grid gap-2 rounded-lg border border-border/65 bg-background/35 px-3 py-3">
        <input
          aria-label="Window opacity"
          className="ui-range-slider"
          max={MAX_WINDOW_OPACITY_PERCENT}
          min={MIN_WINDOW_OPACITY_PERCENT}
          onChange={(event) => {
            const nextOpacity = normalizeWindowOpacityPercent(
              Number(event.target.value),
            );

            setSettings((current) => ({
              ...current,
              windowOpacity: nextOpacity,
            }));
          }}
          step={1}
          style={
            {
              "--slider-fill": `${sliderFillPercent}%`,
            } as CSSProperties
          }
          type="range"
          value={settings.windowOpacity}
        />

        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <span>{MIN_WINDOW_OPACITY_PERCENT}% Min</span>
          <span>{MAX_WINDOW_OPACITY_PERCENT}%</span>
        </div>
      </div>
    </section>
  );
}
