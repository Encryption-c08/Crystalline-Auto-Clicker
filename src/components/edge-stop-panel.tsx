import type { Dispatch, ReactNode, SetStateAction } from "react";

import { compactInlineFieldClassName } from "@/components/compact-control-styles";
import {
  finalizeEdgeStopWidth,
  normalizeEdgeStopWidthInput,
} from "@/config/runtime";
import {
  edgeStopSideLabels,
  edgeStopSides,
  type AutoClickerSettings,
} from "@/config/settings";
import { Input } from "@tauri-ui/components/ui/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@tauri-ui/components/ui/toggle-group";
import { cn } from "@tauri-ui/lib/utils";

const EDGE_STOP_DESCRIPTION =
  "Draws failsafe bars on the exposed outer edges of your monitor layout. Touching a bar stops the auto clicker. Set a side to 0 to disable that wall.";

type EdgeStopWidthKey =
  | "edgeStopTopWidth"
  | "edgeStopRightWidth"
  | "edgeStopBottomWidth"
  | "edgeStopLeftWidth";

const EDGE_STOP_WIDTH_FIELD_BY_SIDE: Record<
  (typeof edgeStopSides)[number],
  EdgeStopWidthKey
> = {
  top: "edgeStopTopWidth",
  right: "edgeStopRightWidth",
  bottom: "edgeStopBottomWidth",
  left: "edgeStopLeftWidth",
};

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
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[20rem] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/tooltip:opacity-100">
        <div className="ui-themed-tooltip rounded-md border px-3 py-1.5 text-xs backdrop-blur-sm">
          {description}
        </div>
        <div className="ui-themed-tooltip-arrow absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b" />
      </div>
    </div>
  );
}

type EdgeStopPanelProps = {
  settings: AutoClickerSettings;
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>;
};

export function EdgeStopPanel({ settings, setSettings }: EdgeStopPanelProps) {
  const isEdgeStopActive = settings.edgeStopEnabled;

  function commitEdgeStopWidths() {
    setSettings((current) => ({
      ...current,
      edgeStopTopWidth: finalizeEdgeStopWidth(current.edgeStopTopWidth),
      edgeStopRightWidth: finalizeEdgeStopWidth(current.edgeStopRightWidth),
      edgeStopBottomWidth: finalizeEdgeStopWidth(current.edgeStopBottomWidth),
      edgeStopLeftWidth: finalizeEdgeStopWidth(current.edgeStopLeftWidth),
    }));
  }

  const widthGrid = (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      {edgeStopSides.map((side) => {
        const field = EDGE_STOP_WIDTH_FIELD_BY_SIDE[side];
        const value = settings[field];

        return (
          <div
            className={cn(
              compactInlineFieldClassName,
              isEdgeStopActive
                ? "border-border/70 bg-background/65"
                : "border-border/60 bg-background/30 opacity-70",
            )}
            key={side}
          >
            <div
              className={cn(
                "flex shrink-0 items-center px-2 text-[10px] font-semibold uppercase tracking-[0.14em]",
                isEdgeStopActive
                  ? "text-muted-foreground"
                  : "text-muted-foreground/80",
              )}
            >
              {edgeStopSideLabels[side]}
            </div>
            <div className="min-w-0 flex-1 border-l border-border/70">
              <Input
                aria-label={`${edgeStopSideLabels[side]} edge stop width`}
                className="h-full w-full rounded-none border-0 bg-transparent px-2 text-center text-base font-semibold shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-base"
                disabled={!isEdgeStopActive}
                inputMode="numeric"
                onBlur={commitEdgeStopWidths}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    [field]: normalizeEdgeStopWidthInput(event.target.value),
                  }))
                }
                type="text"
                value={value}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  const rowContent = (
    <div
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors",
        isEdgeStopActive
          ? "border-border/70 bg-card/35"
          : "border-border/60 bg-background/20 hover:bg-background/28",
      )}
    >
      <div className="min-w-0 shrink-0 pr-2">
        <p className="text-base font-semibold text-foreground">Edge Stop</p>
      </div>

      <div className="ml-auto grid w-full max-w-[21rem] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <DescriptionTooltip description={EDGE_STOP_DESCRIPTION}>
          {widthGrid}
        </DescriptionTooltip>

        <ToggleGroup
          className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
          onValueChange={(value) => {
            if (!value) {
              return;
            }

            setSettings((current) => ({
              ...current,
              edgeStopEnabled: value === "on",
            }));
          }}
          size="sm"
          type="single"
          value={isEdgeStopActive ? "on" : "off"}
          variant="default"
        >
          <ToggleGroupItem
            aria-label="Turn edge stop off"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-background/90 data-[state=on]:text-foreground focus-visible:ring-0"
            value="off"
          >
            Off
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Turn edge stop on"
            className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-muted-foreground/15 data-[state=on]:text-foreground focus-visible:ring-0"
            value="on"
          >
            On
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );

  return <>{rowContent}</>;
}
