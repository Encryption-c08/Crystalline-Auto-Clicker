import type { Dispatch, ReactNode, SetStateAction } from "react";

import { compactInlineFieldClassName } from "@/components/compact-control-styles";
import type { AutoClickerSettings } from "@/config/settings";
import type { DisabledDependencyTarget } from "@/components/disabled-feature-dependency";
import { finalizeClickLimit, normalizeClickLimitInput } from "@/config/runtime";
import { DisabledReasonOverlay } from "@/components/disabled-reason-overlay";
import { Input } from "@tauri-ui/components/ui/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@tauri-ui/components/ui/toggle-group";
import { cn } from "@tauri-ui/lib/utils";

const CLICK_LIMIT_DESCRIPTION =
  "Stops the auto clicker after a set number of clicks have been performed.";

function DescriptionTooltip({ children }: { children: ReactNode }) {
  return (
    <div className="group/tooltip relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[20rem] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/tooltip:opacity-100">
        <div className="ui-themed-tooltip rounded-md border px-3 py-1.5 text-xs backdrop-blur-sm">
          {CLICK_LIMIT_DESCRIPTION}
        </div>
        <div className="ui-themed-tooltip-arrow absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b" />
      </div>
    </div>
  );
}

type ClickLimitPanelProps = {
  onUnavailablePress?: (target: DisabledDependencyTarget) => void;
  settings: AutoClickerSettings;
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>;
};

export function ClickLimitPanel({
  onUnavailablePress,
  settings,
  setSettings,
}: ClickLimitPanelProps) {
  const { clickLimit, clickLimitEnabled, mouseAction } = settings;
  const isClickLimitAvailable = mouseAction === "click";
  const isClickLimitActive = isClickLimitAvailable && clickLimitEnabled;
  const unavailableReason = !isClickLimitAvailable
    ? "Disabled due to Action: Hold"
    : null;

  const inputGroup = (
    <div
      className={cn(
        compactInlineFieldClassName,
        isClickLimitActive
          ? "border-border/70 bg-background/65"
          : "border-border/60 bg-background/30 opacity-70",
      )}
    >
      <Input
        aria-label="Max clicks"
        className="h-full w-24 rounded-none border-0 bg-transparent px-3 text-center text-base font-semibold shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-base"
        disabled={!isClickLimitActive}
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
          isClickLimitActive
            ? "text-muted-foreground"
            : "text-muted-foreground/80",
        )}
      >
        Clicks
      </div>
    </div>
  );

  const rowContent = (
    <div
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors",
        isClickLimitActive
          ? "border-border/70 bg-card/35"
          : "border-border/60 bg-background/20 hover:bg-background/28",
      )}
    >
      <div className="min-w-0 shrink-0 pr-2">
        <p className="text-base font-semibold text-foreground">Click Limit</p>
      </div>

      <div className="relative ml-auto grid w-full max-w-[18.75rem] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        {isClickLimitActive ? (
          <DescriptionTooltip>{inputGroup}</DescriptionTooltip>
        ) : (
          inputGroup
        )}

        <ToggleGroup
          className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
          onValueChange={(value) => {
            if (!value || !isClickLimitAvailable) {
              return;
            }

            setSettings((current) => ({
              ...current,
              clickLimitEnabled: value === "on",
            }));
          }}
          size="sm"
          type="single"
          value={isClickLimitActive ? "on" : "off"}
          variant="default"
        >
          <ToggleGroupItem
            aria-label="Turn click limit off"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-background/90 data-[state=on]:text-foreground focus-visible:ring-0"
            disabled={!isClickLimitAvailable}
            value="off"
          >
            Off
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Turn click limit on"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-muted-foreground/15 data-[state=on]:text-foreground focus-visible:ring-0"
            disabled={!isClickLimitAvailable}
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
      {isClickLimitActive || unavailableReason ? (
        rowContent
      ) : (
        <DescriptionTooltip>{rowContent}</DescriptionTooltip>
      )}
    </>
  );
}
