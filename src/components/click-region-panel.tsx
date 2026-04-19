import type { Dispatch, ReactNode, SetStateAction } from "react";

import type { DisabledDependencyTarget } from "@/components/disabled-feature-dependency";
import { DisabledReasonOverlay } from "@/components/disabled-reason-overlay";
import type { AutoClickerSettings } from "@/config/settings";
import { isClickRegionValid } from "@/lib/click-region";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@tauri-ui/components/ui/toggle-group";
import { cn } from "@tauri-ui/lib/utils";

const CLICK_REGION_DESCRIPTION =
  "Uses the overlay to draw a movable, resizable screen region. While enabled, click actions only fire inside that region without turning the auto clicker off when the cursor leaves it.";

function DescriptionTooltip({
  children,
  description,
}: {
  children: ReactNode;
  description: string;
}) {
  return (
    <div className="group/tooltip relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-[60] mb-2 w-max max-w-[20rem] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/tooltip:opacity-100">
        <div className="ui-themed-tooltip rounded-md border px-3 py-1.5 text-xs backdrop-blur-sm">
          {description}
        </div>
        <div className="ui-themed-tooltip-arrow absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b" />
      </div>
    </div>
  );
}

type ClickRegionPanelProps = {
  isEditing: boolean;
  onEditStart: () => void | Promise<void>;
  onEnable: () => void | Promise<void>;
  onReset: () => void | Promise<void>;
  onUnavailablePress?: (target: DisabledDependencyTarget) => void;
  settings: AutoClickerSettings;
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>;
};

export function ClickRegionPanel({
  isEditing,
  onEditStart,
  onEnable,
  onReset,
  onUnavailablePress,
  settings,
  setSettings,
}: ClickRegionPanelProps) {
  const isClickRegionAvailable = settings.mouseAction === "click";
  const region = isClickRegionValid(settings.clickRegion)
    ? settings.clickRegion
    : null;
  const hasRegion = region !== null;
  const isClickRegionActive = isClickRegionAvailable && settings.clickRegionEnabled;
  const regionLabel = region ? `${region.width} x ${region.height}` : "No region";
  const unavailableReason = !isClickRegionAvailable
    ? "Disabled due to Action: Hold"
    : null;

  const rowContent = (
    <div
      className={cn(
        "flex min-h-[5.5rem] w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors",
        isClickRegionActive
          ? "border-border/70 bg-card/35"
          : "border-border/60 bg-background/20 hover:bg-background/28",
      )}
    >
      <div className="min-w-0 shrink-0 pr-2">
        <p className="text-base font-semibold text-foreground">Click Region</p>
      </div>

      <div className="relative ml-auto grid w-full max-w-[21rem] min-w-0 grid-cols-[minmax(0,1fr)_5.5rem_4.75rem_auto] items-center gap-2">
        <div
          className={cn(
            "flex h-8 min-w-0 items-center justify-center rounded-lg border px-3 text-[11px] font-semibold uppercase tracking-[0.14em] tabular-nums",
            hasRegion
              ? "border-border/70 bg-background/55 text-muted-foreground"
              : "border-border/60 bg-background/30 text-muted-foreground/75",
          )}
        >
          <span className="truncate">{regionLabel}</span>
        </div>

        {isEditing ? (
          <div className="flex h-8 items-center justify-center rounded-lg border border-border/70 bg-background/55 px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
            Editing
          </div>
        ) : (
          <button
            className={cn(
              "flex h-8 w-full items-center justify-center rounded-lg border px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-0",
              isClickRegionAvailable
                ? "border-border/70 bg-background/60 text-foreground hover:bg-background/85"
                : "cursor-not-allowed border-border/55 bg-background/30 text-muted-foreground/65",
            )}
            disabled={!isClickRegionAvailable}
            onClick={() => {
              if (!isClickRegionAvailable) {
                onUnavailablePress?.("mouse-action-hold");
                return;
              }

              void onEditStart();
            }}
            type="button"
          >
            Edit
          </button>
        )}

        <button
          className={cn(
            "flex h-8 w-full items-center justify-center rounded-lg border px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-0",
            isClickRegionAvailable
              ? "border-border/70 bg-background/60 text-foreground hover:bg-background/85"
              : "cursor-not-allowed border-border/55 bg-background/30 text-muted-foreground/65",
          )}
          disabled={!isClickRegionAvailable}
          onClick={() => {
            if (!isClickRegionAvailable) {
              onUnavailablePress?.("mouse-action-hold");
              return;
            }

            void onReset();
          }}
          type="button"
        >
          Reset
        </button>

        <ToggleGroup
          className="justify-self-end overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
          onValueChange={(value) => {
            if (!value) {
              return;
            }

            if (value === "on") {
              if (!isClickRegionAvailable) {
                onUnavailablePress?.("mouse-action-hold");
                return;
              }

              void onEnable();
              return;
            }

            setSettings((current) => ({
              ...current,
              clickRegionEnabled: false,
            }));
          }}
          size="sm"
          type="single"
          value={isClickRegionActive ? "on" : "off"}
          variant="default"
        >
          <ToggleGroupItem
            aria-label="Turn click region off"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-background/90 data-[state=on]:text-foreground focus-visible:ring-0"
            value="off"
          >
            Off
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Turn click region on"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-muted-foreground/15 data-[state=on]:text-foreground focus-visible:ring-0"
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

  return isClickRegionActive ? (
    rowContent
  ) : (
    <DescriptionTooltip description={CLICK_REGION_DESCRIPTION}>
      {rowContent}
    </DescriptionTooltip>
  );
}
