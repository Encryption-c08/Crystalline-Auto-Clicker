import type { Dispatch, ReactNode, SetStateAction } from "react";

import { compactInlineFieldClassName } from "@/components/compact-control-styles";
import type { AutoClickerSettings } from "@/config/settings";
import type { DisabledDependencyTarget } from "@/components/disabled-feature-dependency";
import {
  estimateAverageClicksPerSecond,
  finalizeClickDurationRange,
  formatClicksPerSecond,
  normalizeClickDurationInput,
} from "@/config/runtime";
import { DisabledReasonOverlay } from "@/components/disabled-reason-overlay";
import { Input } from "@tauri-ui/components/ui/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@tauri-ui/components/ui/toggle-group";
import { cn } from "@tauri-ui/lib/utils";

const CLICK_DURATION_DESCRIPTION =
  "Randomizes how long each click holds the mouse button down before releasing within the selected ms range.";

function DescriptionTooltip({ children }: { children: ReactNode }) {
  return (
    <div className="group/tooltip relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[20rem] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/tooltip:opacity-100">
        <div className="ui-themed-tooltip rounded-md border px-3 py-1.5 text-xs backdrop-blur-sm">
          {CLICK_DURATION_DESCRIPTION}
        </div>
        <div className="ui-themed-tooltip-arrow absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b" />
      </div>
    </div>
  );
}

type ClickDurationPanelProps = {
  onUnavailablePress?: (target: DisabledDependencyTarget) => void;
  settings: AutoClickerSettings;
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>;
};

export function ClickDurationPanel({
  onUnavailablePress,
  settings,
  setSettings,
}: ClickDurationPanelProps) {
  const {
    clickDurationEnabled,
    clickDurationMax,
    clickDurationMin,
    mouseAction,
  } = settings;
  const isClickDurationAvailable = mouseAction === "click";
  const isClickDurationActive =
    isClickDurationAvailable && clickDurationEnabled;
  const unavailableReason = !isClickDurationAvailable
    ? "Disabled due to Action: Hold"
    : null;
  const averageClicksPerSecond = estimateAverageClicksPerSecond(settings);
  const averageClicksLabel = isClickDurationActive
    ? `Avg ${formatClicksPerSecond(averageClicksPerSecond ?? 0)} CPS`
    : null;

  function commitClickDurationRange() {
    setSettings((current) => {
      const range = finalizeClickDurationRange(
        current.clickDurationMin,
        current.clickDurationMax,
      );

      return {
        ...current,
        clickDurationMin: range.min,
        clickDurationMax: range.max,
      };
    });
  }

  const inputGroup = (
    <div
      className={cn(
        compactInlineFieldClassName,
        isClickDurationActive
          ? "border-border/70 bg-background/65"
          : "border-border/60 bg-background/30 opacity-70",
      )}
    >
      <Input
        aria-label="Minimum click duration"
        className="h-full w-16 rounded-none border-0 bg-transparent px-3 text-center text-base font-semibold shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-base"
        disabled={!isClickDurationActive}
        inputMode="numeric"
        onBlur={commitClickDurationRange}
        onChange={(event) =>
          setSettings((current) => ({
            ...current,
            clickDurationMin: normalizeClickDurationInput(event.target.value),
          }))
        }
        type="text"
        value={clickDurationMin}
      />
      <div
        className={cn(
          "flex items-center border-l border-border/70 px-2 text-[10px] font-semibold uppercase tracking-[0.18em]",
          isClickDurationActive
            ? "text-muted-foreground"
            : "text-muted-foreground/80",
        )}
      >
        To
      </div>
      <div className="border-l border-border/70">
        <Input
          aria-label="Maximum click duration"
          className="h-full w-16 rounded-none border-0 bg-transparent px-3 text-center text-base font-semibold shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-base"
          disabled={!isClickDurationActive}
          inputMode="numeric"
          onBlur={commitClickDurationRange}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              clickDurationMax: normalizeClickDurationInput(event.target.value),
            }))
          }
          type="text"
          value={clickDurationMax}
        />
      </div>
      <div
        className={cn(
          "flex items-center border-l border-border/70 px-3 text-[11px] font-semibold uppercase tracking-[0.12em]",
          isClickDurationActive
            ? "text-muted-foreground"
            : "text-muted-foreground/80",
        )}
      >
        Ms
      </div>
    </div>
  );

  const rowContent = (
    <div
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors",
        isClickDurationActive
          ? "border-border/70 bg-card/35"
          : "border-border/60 bg-background/20 hover:bg-background/28",
      )}
    >
      <div className="min-w-0 shrink-0 pr-2">
        <p className="text-base font-semibold text-foreground">
          Click Duration
        </p>
        {averageClicksLabel ? (
          <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
            {averageClicksLabel}
          </p>
        ) : null}
      </div>

      <div className="relative ml-auto grid w-full max-w-[18.75rem] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        {isClickDurationActive ? (
          <DescriptionTooltip>{inputGroup}</DescriptionTooltip>
        ) : (
          inputGroup
        )}

        <ToggleGroup
          className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
          onValueChange={(value) => {
            if (!value) {
              return;
            }

            setSettings((current) => ({
              ...current,
              clickDurationEnabled: value === "on",
            }));
          }}
          size="sm"
          type="single"
          value={isClickDurationActive ? "on" : "off"}
          variant="default"
        >
          <ToggleGroupItem
            aria-label="Turn click duration off"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-background/90 data-[state=on]:text-foreground focus-visible:ring-0"
            disabled={!isClickDurationAvailable}
            value="off"
          >
            Off
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Turn click duration on"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-muted-foreground/15 data-[state=on]:text-foreground focus-visible:ring-0"
            disabled={!isClickDurationAvailable}
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
  );

  return (
    <>
      {isClickDurationActive || unavailableReason ? (
        rowContent
      ) : (
        <DescriptionTooltip>{rowContent}</DescriptionTooltip>
      )}
    </>
  );
}
