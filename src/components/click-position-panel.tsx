import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import {
  MinusIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import type { DisabledDependencyTarget } from "@/components/disabled-feature-dependency";
import type { AutoClickerSettings } from "@/config/settings";
import { formatKeyboardHotkey, UNBOUND_HOTKEY } from "@/input/hotkeys";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@tauri-ui/components/ui/toggle-group";
import { cn } from "@tauri-ui/lib/utils";

const CLICK_POSITION_HOTKEY_DESCRIPTION =
  "Spawns a dot at your cursor position.";
const CLEAR_DOTS_DESCRIPTION = "Deletes every dot currently on the screen.";
export const CLICK_POSITION_DESCRIPTION =
  "Lets you place dots and replay clicks at those saved positions in order.";
const CLICK_POSITION_MODE_DESCRIPTIONS = {
  standard:
    "Moves your cursor to each saved dot before clicking.\nBest for replaying clicks across multiple screen positions, but it takes control of your cursor while running.",
  "non-intrusive":
    "Sends clicks to the locked target window without pulling your cursor away, so you can keep using your mouse.\nThis mode does not work while that target window is minimized.",
} as const;

export function ClickPositionDescriptionTooltip({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="group/click-position-tooltip relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[18rem] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/click-position-tooltip:opacity-100">
        <div className="ui-themed-tooltip rounded-md border px-3 py-1.5 text-xs backdrop-blur-sm">
          {CLICK_POSITION_DESCRIPTION}
        </div>
        <div className="ui-themed-tooltip-arrow absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b" />
      </div>
    </div>
  );
}

function HotkeyTooltip({ children }: { children: ReactNode }) {
  return (
    <div className="group/hotkey-tooltip relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[16rem] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/hotkey-tooltip:opacity-100">
        <div className="ui-themed-tooltip rounded-md border px-3 py-1.5 text-xs backdrop-blur-sm">
          {CLICK_POSITION_HOTKEY_DESCRIPTION}
        </div>
        <div className="ui-themed-tooltip-arrow absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b" />
      </div>
    </div>
  );
}

function ClearDotsTooltip({ children }: { children: ReactNode }) {
  return (
    <div className="group/clear-dots-tooltip relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[16rem] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/clear-dots-tooltip:opacity-100">
        <div className="ui-themed-tooltip rounded-md border px-3 py-1.5 text-xs backdrop-blur-sm">
          {CLEAR_DOTS_DESCRIPTION}
        </div>
        <div className="ui-themed-tooltip-arrow absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b" />
      </div>
    </div>
  );
}

function ClickPositionModeToggleItem({
  ariaLabel,
  children,
  className,
  description,
  disabled,
  value,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  description: string;
  disabled?: boolean;
  value: "standard" | "non-intrusive";
}) {
  return (
    <ToggleGroupItem
      aria-label={ariaLabel}
      className={cn(
        "group/click-position-mode-item relative",
        className,
      )}
      disabled={disabled}
      value={value}
    >
      <span>{children}</span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 max-w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2 opacity-0 transition-[opacity,transform] duration-120 group-hover/click-position-mode-item:opacity-100">
        <div className="ui-themed-tooltip rounded-md border px-3 py-1.5 text-left text-xs whitespace-pre-line normal-case tracking-normal backdrop-blur-sm">
          {description}
        </div>
        <div className="ui-themed-tooltip-arrow absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b" />
      </div>
    </ToggleGroupItem>
  );
}

type ClickPositionPanelProps = {
  onAddCenteredDot: () => void;
  onClearDots: () => void;
  onRemoveDot: () => void;
  onUnavailablePress?: (target: DisabledDependencyTarget) => void;
  settings: AutoClickerSettings;
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>;
};

export type ClickPositionControlCallbacks = Pick<
  ClickPositionPanelProps,
  "onAddCenteredDot" | "onClearDots" | "onRemoveDot"
>;

export type ClickPositionControlsProps = ClickPositionPanelProps;

function ClickPositionControls({
  onAddCenteredDot,
  onClearDots,
  onRemoveDot,
  onUnavailablePress,
  settings,
  setSettings,
  variant = "panel",
}: ClickPositionControlsProps & {
  variant?: "inline" | "panel";
}) {
  const [isCapturingHotkey, setIsCapturingHotkey] = useState(false);

  const isClickPositionActive =
    settings.mouseAction === "click" && settings.clickPositions.length > 0;
  const dotCount = settings.clickPositions.length;
  const dotLabel = `${dotCount} dot${dotCount === 1 ? "" : "s"}`;
  const isClickPositionHotkeyUnbound = settings.clickPositionHotkey.code === "";
  const isNonIntrusiveModeActive =
    isClickPositionActive &&
    settings.clickPositionNonIntrusiveEnabled &&
    dotCount > 0;
  const isInline = variant === "inline";
  const iconButtonClassName =
    "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-0";
  const activeIconButtonClassName =
    "border-border/70 bg-background/60 text-foreground hover:bg-background/85";
  const inactiveIconButtonClassName =
    "cursor-not-allowed border-border/55 bg-background/30 text-muted-foreground/65";

  useEffect(() => {
    if (!isCapturingHotkey) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSettings((current) => ({
          ...current,
          clickPositionHotkey: { ...UNBOUND_HOTKEY },
        }));
        setIsCapturingHotkey(false);
        return;
      }

      const nextHotkey = formatKeyboardHotkey(event);
      if (!nextHotkey) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSettings((current) => ({
        ...current,
        clickPositionHotkey: nextHotkey,
      }));
      setIsCapturingHotkey(false);
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isCapturingHotkey, setSettings]);

  const dotCountBadge = (
    <div className="rounded-lg border border-border/70 bg-background/55 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {dotLabel}
    </div>
  );

  const dotActions = (
    <>
      <button
        aria-label="Add a centered click position dot"
        className={cn(iconButtonClassName, activeIconButtonClassName)}
        onClick={onAddCenteredDot}
        type="button"
      >
        <PlusIcon className="size-4" />
      </button>

      <button
        aria-label="Remove the newest click position dot"
        className={cn(
          iconButtonClassName,
          dotCount > 0
            ? activeIconButtonClassName
            : inactiveIconButtonClassName,
        )}
        disabled={dotCount === 0}
        onClick={onRemoveDot}
        type="button"
      >
        <MinusIcon className="size-4" />
      </button>

      <ClearDotsTooltip>
        <button
          aria-label="Delete all click position dots"
          className={cn(
            iconButtonClassName,
            dotCount > 0
              ? activeIconButtonClassName
              : inactiveIconButtonClassName,
          )}
          disabled={dotCount === 0}
          onClick={onClearDots}
          type="button"
        >
          <Trash2Icon className="size-4" />
        </button>
      </ClearDotsTooltip>

      <button
        className={cn(
          "flex h-8 items-center rounded-lg border px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-0",
          dotCount > 0
            ? activeIconButtonClassName
            : inactiveIconButtonClassName,
        )}
        disabled={dotCount === 0}
        onClick={() =>
          setSettings((current) => ({
            ...current,
            clickPositionDotsVisible: !current.clickPositionDotsVisible,
          }))
        }
        type="button"
      >
        {settings.clickPositionDotsVisible ? "Hide Dots" : "Show Dots"}
      </button>
    </>
  );

  const hotkeyControls = (
    <>
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Hotkey
      </span>

      <HotkeyTooltip>
        <button
          className={cn(
            "flex h-8 min-w-[9rem] items-center justify-start rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-0",
            isCapturingHotkey
              ? "border-white/60 bg-white/10 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_0_22px_rgba(255,255,255,0.11)]"
              : isClickPositionHotkeyUnbound
                ? "border-border/60 bg-background/30 text-muted-foreground"
                : "border-border/70 bg-background/60 text-foreground hover:bg-background/85",
          )}
          data-click-position-hotkey-capture
          onClick={() => setIsCapturingHotkey(true)}
          type="button"
        >
          {isCapturingHotkey
            ? "Listening..."
            : isClickPositionHotkeyUnbound
              ? "Press any key"
              : settings.clickPositionHotkey.label}
        </button>
      </HotkeyTooltip>
    </>
  );

  const nonIntrusiveModeControls = (
    <>
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Mode
      </span>

      <ToggleGroup
        className="overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
        onValueChange={(value) => {
          if (!value) {
            return;
          }

          if (value === "non-intrusive" && settings.mouseAction !== "click") {
            onUnavailablePress?.("mouse-action-hold");
            return;
          }

          if (value === "non-intrusive" && dotCount === 0) {
            return;
          }

          setSettings((current) => ({
            ...current,
            clickPositionNonIntrusiveEnabled: value === "non-intrusive",
          }));
        }}
        size="sm"
        type="single"
        value={isNonIntrusiveModeActive ? "non-intrusive" : "standard"}
        variant="default"
      >
        <ClickPositionModeToggleItem
          ariaLabel="Use standard click-position playback"
          className="px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0"
          description={CLICK_POSITION_MODE_DESCRIPTIONS.standard}
          disabled={!isClickPositionActive}
          value="standard"
        >
          Standard
        </ClickPositionModeToggleItem>
        <ClickPositionModeToggleItem
          ariaLabel="Use non-intrusive click-position playback"
          className="px-2.5 data-[state=on]:bg-muted-foreground/15 focus-visible:ring-0"
          description={CLICK_POSITION_MODE_DESCRIPTIONS["non-intrusive"]}
          disabled={!isClickPositionActive || dotCount === 0}
          value="non-intrusive"
        >
          Non-Intrusive
        </ClickPositionModeToggleItem>
      </ToggleGroup>
    </>
  );

  if (isInline) {
    const inlineContent = (
      <div className="grid gap-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="mr-auto flex min-w-0 items-center gap-2.5">
            <p className="text-sm font-semibold text-foreground">
              Click Positions
            </p>
            {dotCountBadge}
          </div>
          {dotActions}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {hotkeyControls}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {nonIntrusiveModeControls}
        </div>
      </div>
    );

    return inlineContent;
  }

  const panelContent = (
    <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-card/35 px-3 py-2 transition-colors">
      <p className="row-span-2 pt-1 text-base font-semibold text-foreground">
        Click Positions
      </p>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {dotCountBadge}
        {dotActions}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {hotkeyControls}
      </div>

      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2">
        {nonIntrusiveModeControls}
      </div>
    </div>
  );

  return isClickPositionActive ? (
    panelContent
  ) : (
    <ClickPositionDescriptionTooltip>{panelContent}</ClickPositionDescriptionTooltip>
  );
}

export function ClickPositionPanel(props: ClickPositionControlsProps) {
  return <ClickPositionControls {...props} />;
}

export function InlineClickPositionControls(props: ClickPositionControlsProps) {
  return <ClickPositionControls {...props} variant="inline" />;
}
