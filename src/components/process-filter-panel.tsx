import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useDeferredValue, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  AppWindowIcon,
  ChevronDownIcon,
  MousePointerClickIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  XIcon,
} from "lucide-react";

import {
  normalizeProcessRuleList,
  normalizeProcessRuleName,
  type AutoClickerSettings,
} from "@/config/settings";
import {
  pickProcessNameFromClick,
  type OpenAppProcess,
} from "@/lib/process-filters";
import { Badge } from "@tauri-ui/components/ui/badge";
import { Button } from "@tauri-ui/components/ui/button";
import { Input } from "@tauri-ui/components/ui/input";
import { cn } from "@tauri-ui/lib/utils";

type ProcessFilterPanelProps = {
  allProcessNames: string[];
  openAppProcesses: OpenAppProcess[];
  processListError: string | null;
  processListLoading: boolean;
  settings: AutoClickerSettings;
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>;
};

const quickProcessesDescription =
  "Only shows apps that currently have an open window.";
const searchAllProcessesDescription =
  "Searches every running process, including background processes.";
const pickProcessDescription =
  "Temporarily hides the app, then lets you click any window to select its process.";
const whitelistButtonDescription =
  "Adds the selected app to the allow list. Once the allow list has anything in it, only those apps can receive clicks or overlay.";
const blacklistButtonDescription =
  "Adds the selected app to the block list. Blocked apps are skipped, but only while the allow list is empty.";
const whitelistListDescription =
  "Only apps in this list can receive clicks or overlay. If this list has entries, every other app is ignored.";
const blacklistListDescription =
  "Apps in this list are blocked from clicks or overlay. These rules only apply while the allow list is empty.";

function HoverDescription({
  align = "center",
  children,
  description,
  maxWidth = "26rem",
}: {
  align?: "center" | "end" | "start";
  children: ReactNode;
  description: string;
  maxWidth?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [layout, setLayout] = useState<{
    arrowLeft: number;
    placement: "bottom" | "top";
    left: number;
    top: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !tooltipRef.current) {
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 10;

    let left =
      align === "start"
        ? triggerRect.left
        : align === "end"
          ? triggerRect.right - tooltipRect.width
          : triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding),
    );

    const fitsAbove = triggerRect.top >= tooltipRect.height + gap + viewportPadding;
    const placement = fitsAbove ? "top" : "bottom";
    const top = fitsAbove
      ? triggerRect.top - tooltipRect.height - gap
      : Math.min(
          triggerRect.bottom + gap,
          window.innerHeight - tooltipRect.height - viewportPadding,
        );
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    const arrowLeft = Math.max(
      14,
      Math.min(tooltipRect.width - 14, triggerCenter - left),
    );

    setLayout({
      arrowLeft,
      left,
      placement,
      top,
    });
  }, [align, description, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setLayout(null);
      return;
    }

    function updateLayout() {
      if (!triggerRef.current || !tooltipRef.current) {
        return;
      }

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 10;

      let left =
        align === "start"
          ? triggerRect.left
          : align === "end"
            ? triggerRect.right - tooltipRect.width
            : triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      left = Math.max(
        viewportPadding,
        Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding),
      );

      const fitsAbove = triggerRect.top >= tooltipRect.height + gap + viewportPadding;
      const placement = fitsAbove ? "top" : "bottom";
      const top = fitsAbove
        ? triggerRect.top - tooltipRect.height - gap
        : Math.min(
            triggerRect.bottom + gap,
            window.innerHeight - tooltipRect.height - viewportPadding,
          );
      const triggerCenter = triggerRect.left + triggerRect.width / 2;
      const arrowLeft = Math.max(
        14,
        Math.min(tooltipRect.width - 14, triggerCenter - left),
      );

      setLayout({
        arrowLeft,
        left,
        placement,
        top,
      });
    }

    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);

    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [align, isOpen]);

  return (
    <>
      <span
        aria-describedby={isOpen ? tooltipId : undefined}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsOpen(false);
          }
        }}
        onFocus={() => setIsOpen(true)}
        onPointerEnter={() => setIsOpen(true)}
        onPointerLeave={() => setIsOpen(false)}
        ref={triggerRef}
        className="inline-flex max-w-full w-fit shrink-0"
      >
        {children}
      </span>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <span
              id={tooltipId}
              ref={tooltipRef}
              style={{
                fontFamily: "var(--font-sans)",
                letterSpacing: "normal",
                left: layout?.left ?? -9999,
                maxWidth,
                textTransform: "none",
                top: layout?.top ?? -9999,
              }}
              className={cn(
                "ui-themed-tooltip pointer-events-none fixed z-[250] rounded-md border px-3 py-1.5 text-[12px] font-medium leading-4 backdrop-blur-sm transition-opacity duration-120",
                layout ? "opacity-100" : "opacity-0",
              )}
              role="tooltip"
            >
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  letterSpacing: "normal",
                  textTransform: "none",
                }}
                className="block whitespace-normal break-words"
              >
                {description}
              </span>
              {layout ? (
                <span
                  style={{ left: layout.arrowLeft }}
                  className={cn(
                    "ui-themed-tooltip-arrow absolute h-2.5 w-2.5 -translate-x-1/2 rotate-45",
                    layout.placement === "top"
                      ? "top-full -translate-y-[5px] border-r border-b"
                      : "bottom-full translate-y-[5px] border-l border-t",
                  )}
                />
              ) : null}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

function ProcessRuleChip({
  iconDataUrl,
  name,
  onRemove,
}: {
  iconDataUrl: string | null;
  name: string;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-border/65 bg-background/60 px-3 py-2 text-sm font-medium text-foreground"
    >
      {iconDataUrl ? (
        <img
          alt=""
          className="size-5 shrink-0 rounded-[6px] object-contain"
          src={iconDataUrl}
        />
      ) : (
        <div className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-black/10 text-current/80 dark:bg-white/10">
          <AppWindowIcon className="size-3.5" />
        </div>
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <button
        aria-label={`Remove ${name}`}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-current/80 transition-colors hover:bg-black/10 hover:text-current focus-visible:outline-none focus-visible:ring-0 dark:hover:bg-white/10"
        onClick={onRemove}
        type="button"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

function QuickProcessRow({
  active,
  iconDataUrl,
  onClick,
  processName,
}: {
  active: boolean;
  iconDataUrl: string | null;
  onClick: () => void;
  processName: string;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-0",
        active
          ? "border-border bg-muted/80 text-foreground"
          : "border-border/65 bg-background/55 text-foreground hover:bg-background/80",
      )}
      onClick={onClick}
      type="button"
    >
      {iconDataUrl ? (
        <img
          alt=""
          className="size-6 shrink-0 rounded-[7px] object-contain"
          src={iconDataUrl}
        />
      ) : (
        <div className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-muted/70 text-muted-foreground">
          <AppWindowIcon className="size-3.5" />
        </div>
      )}
      <span className="min-w-0 truncate text-sm font-medium">{processName}</span>
    </button>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ProcessFilterPanel({
  allProcessNames,
  openAppProcesses,
  processListError,
  processListLoading,
  settings,
  setSettings,
}: ProcessFilterPanelProps) {
  const processFilterSectionId = useId();
  const [draftProcessName, setDraftProcessName] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isContentMounted, setIsContentMounted] = useState(false);
  const [isContentVisible, setIsContentVisible] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickingProcessName, setPickingProcessName] = useState(false);
  const deferredDraftProcessName = useDeferredValue(
    draftProcessName.trim().toLowerCase(),
  );

  const normalizedDraftProcessName = normalizeProcessRuleName(draftProcessName);
  const whitelistCount = settings.processWhitelist.length;
  const blacklistCount = settings.processBlacklist.length;
  const totalRuleCount = whitelistCount + blacklistCount;
  const hasConfiguredRules = totalRuleCount > 0;

  const quickProcessIcons = new Map(
    openAppProcesses.map((process) => [process.name, process.iconDataUrl]),
  );

  const displayedProcesses =
    deferredDraftProcessName === ""
      ? openAppProcesses.slice(0, 10)
      : allProcessNames
          .filter((processName) => processName.includes(deferredDraftProcessName))
          .slice(0, 12)
          .map((processName) => ({
            iconDataUrl: quickProcessIcons.get(processName) ?? null,
            name: processName,
          }));

  function updateProcessRules(
    updater: (
      current: AutoClickerSettings,
    ) => Partial<
      Pick<
        AutoClickerSettings,
        | "processBlacklist"
        | "processBlacklistEnabled"
        | "processWhitelist"
        | "processWhitelistEnabled"
      >
    >,
  ) {
    setSettings((current) => {
      const nextRules = updater(current);

      return {
        ...current,
        ...nextRules,
        processWhitelist: normalizeProcessRuleList(
          nextRules.processWhitelist ?? current.processWhitelist,
        ),
        processBlacklist: normalizeProcessRuleList(
          nextRules.processBlacklist ?? current.processBlacklist,
        ),
      };
    });
  }

  function addProcessToList(
    list: "blacklist" | "whitelist",
    rawProcessName: string | null | undefined,
  ) {
    const normalizedProcessName = normalizeProcessRuleName(rawProcessName);
    if (!normalizedProcessName) {
      return;
    }

    if (list === "whitelist") {
      updateProcessRules((current) => ({
        processWhitelistEnabled: true,
        processWhitelist: [...current.processWhitelist, normalizedProcessName],
        processBlacklist: current.processBlacklist.filter(
          (name) => name !== normalizedProcessName,
        ),
      }));
    } else {
      updateProcessRules((current) => ({
        processBlacklistEnabled: true,
        processWhitelist: current.processWhitelist.filter(
          (name) => name !== normalizedProcessName,
        ),
        processBlacklist: [...current.processBlacklist, normalizedProcessName],
      }));
    }

    setDraftProcessName("");
  }

  function removeProcessFromList(
    list: "blacklist" | "whitelist",
    processName: string,
  ) {
    if (list === "whitelist") {
      updateProcessRules((current) => ({
        processWhitelist: current.processWhitelist.filter(
          (name) => name !== processName,
        ),
      }));
      return;
    }

    updateProcessRules((current) => ({
      processBlacklist: current.processBlacklist.filter(
        (name) => name !== processName,
      ),
    }));
  }

  function setProcessListEnabled(
    list: "blacklist" | "whitelist",
    enabled: boolean,
  ) {
    updateProcessRules(() =>
      list === "whitelist"
        ? { processWhitelistEnabled: enabled }
        : { processBlacklistEnabled: enabled },
    );
  }

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

  async function selectProcessByClick() {
    setPickerError(null);
    setPickingProcessName(true);

    try {
      const selectedProcessName = await pickProcessNameFromClick();
      if (selectedProcessName) {
        setDraftProcessName(selectedProcessName);
      }
    } catch (error) {
      console.error("Unable to pick process from screen", error);
      setPickerError(
        errorMessage(error, "Unable to pick a process from the screen."),
      );
    } finally {
      setPickingProcessName(false);
    }
  }

  return (
    <section className="grid rounded-xl border border-border/70 bg-card/35 px-3 py-3 transition-colors">
      <button
        aria-controls={processFilterSectionId}
        aria-expanded={isExpanded}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border px-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-0",
          hasConfiguredRules
            ? "border-border/70 bg-background/60 text-foreground hover:bg-background/85"
            : "border-border/60 bg-background/40 text-muted-foreground hover:bg-background/65 hover:text-foreground",
        )}
        onClick={() => setIsExpanded((current) => !current)}
        type="button"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em]">
            Process Filters
          </span>
          <span className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[10px] leading-none text-muted-foreground">
            W {whitelistCount}
          </span>
          <span className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[10px] leading-none text-muted-foreground">
            B {blacklistCount}
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
              ? "mt-3 grid-rows-[1fr] opacity-100"
              : "mt-0 grid-rows-[0fr] opacity-0",
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
            <div
              className="grid gap-3 pb-1 pt-0.5"
              id={processFilterSectionId}
            >
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground">
                  Process Filters
                </p>
              </div>

              <div className="grid gap-3 rounded-lg border border-border/65 bg-background/35 px-3 py-2.5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
                <div className="grid gap-2 lg:row-span-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <AppWindowIcon className="size-3.5" />
                    <HoverDescription
                      align="start"
                      description={quickProcessesDescription}
                    >
                      <span>
                        {deferredDraftProcessName === "" ? "Quick Processes" : "Results"}
                      </span>
                    </HoverDescription>
                  </div>

                  {displayedProcesses.length > 0 ? (
                    <div className="ui-scrollbar-thin grid max-h-[18rem] gap-1.5 overflow-auto pr-1">
                      {displayedProcesses.map((process) => (
                        <QuickProcessRow
                          active={normalizedDraftProcessName === process.name}
                          iconDataUrl={process.iconDataUrl}
                          key={process.name}
                          onClick={() => setDraftProcessName(process.name)}
                          processName={process.name}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {processListLoading
                        ? "Scanning processes..."
                        : deferredDraftProcessName === ""
                          ? "No open apps were found yet."
                          : "No running processes match the current search."}
                    </p>
                  )}
                </div>

                <div className="grid content-start gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <HoverDescription
                      align="start"
                      description={searchAllProcessesDescription}
                    >
                      <span>Search All Processes</span>
                    </HoverDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="min-w-[12rem] flex-1 bg-background/60"
                      onChange={(event) => setDraftProcessName(event.target.value)}
                      placeholder="Search all running processes"
                      value={draftProcessName}
                    />
                    <HoverDescription
                      align="center"
                      description={pickProcessDescription}
                      maxWidth="18rem"
                    >
                      <Button
                        disabled={pickingProcessName}
                        onClick={() => void selectProcessByClick()}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <MousePointerClickIcon className="pointer-events-none size-3.5" />
                        <span>{pickingProcessName ? "Click a Window..." : "Pick"}</span>
                      </Button>
                    </HoverDescription>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <HoverDescription
                      align="start"
                      description={whitelistButtonDescription}
                    >
                      <Button
                        disabled={!normalizedDraftProcessName}
                        onClick={() => addProcessToList("whitelist", draftProcessName)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <ShieldCheckIcon className="size-3.5" />
                        <span>Whitelist</span>
                      </Button>
                    </HoverDescription>
                    <HoverDescription
                      align="end"
                      description={blacklistButtonDescription}
                    >
                      <Button
                        disabled={!normalizedDraftProcessName}
                        onClick={() => addProcessToList("blacklist", draftProcessName)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <ShieldXIcon className="size-3.5" />
                        <span>Blacklist</span>
                      </Button>
                    </HoverDescription>
                  </div>

                  {pickingProcessName ? (
                    <p className="text-xs text-muted-foreground">
                      Click any app window to fill the search bar. Press Esc to cancel.
                    </p>
                  ) : null}

                  {pickerError ? (
                    <p className="text-xs text-destructive">{pickerError}</p>
                  ) : null}

                  {processListError ? (
                    <p className="text-xs text-destructive">{processListError}</p>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid content-start gap-2 rounded-lg border border-border/65 bg-background/35 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheckIcon className="size-4 text-muted-foreground" />
                        <HoverDescription
                          align="start"
                          description={whitelistListDescription}
                        >
                          <span className="text-sm font-semibold text-foreground">Whitelist</span>
                        </HoverDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          aria-pressed={settings.processWhitelistEnabled}
                          className="h-7 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                          onClick={() =>
                            setProcessListEnabled(
                              "whitelist",
                              !settings.processWhitelistEnabled,
                            )
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {settings.processWhitelistEnabled ? "Enabled" : "Disabled"}
                        </Button>
                        <Badge variant="outline">
                          {settings.processWhitelist.length}
                        </Badge>
                      </div>
                    </div>

                    {settings.processWhitelist.length > 0 ? (
                      <div
                        className={cn(
                          "ui-scrollbar-thin grid max-h-[15rem] gap-1.5 overflow-auto pr-1 transition-opacity",
                          !settings.processWhitelistEnabled && "opacity-55",
                        )}
                      >
                        {settings.processWhitelist.map((processName) => (
                          <ProcessRuleChip
                            iconDataUrl={quickProcessIcons.get(processName) ?? null}
                            key={processName}
                            name={processName}
                            onRemove={() =>
                              removeProcessFromList("whitelist", processName)
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid content-start gap-2 rounded-lg border border-border/65 bg-background/35 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldXIcon className="size-4 text-muted-foreground" />
                        <HoverDescription
                          align="end"
                          description={blacklistListDescription}
                        >
                          <span className="text-sm font-semibold text-foreground">Blacklist</span>
                        </HoverDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          aria-pressed={settings.processBlacklistEnabled}
                          className="h-7 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                          onClick={() =>
                            setProcessListEnabled(
                              "blacklist",
                              !settings.processBlacklistEnabled,
                            )
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {settings.processBlacklistEnabled ? "Enabled" : "Disabled"}
                        </Button>
                        <Badge variant="outline">
                          {settings.processBlacklist.length}
                        </Badge>
                      </div>
                    </div>

                    {settings.processBlacklist.length > 0 ? (
                      <div
                        className={cn(
                          "ui-scrollbar-thin grid max-h-[15rem] gap-1.5 overflow-auto pr-1 transition-opacity",
                          !settings.processBlacklistEnabled && "opacity-55",
                        )}
                      >
                        {settings.processBlacklist.map((processName) => (
                          <ProcessRuleChip
                            iconDataUrl={quickProcessIcons.get(processName) ?? null}
                            key={processName}
                            name={processName}
                            onRemove={() =>
                              removeProcessFromList("blacklist", processName)
                            }
                          />
                        ))}
                      </div>
                    ) : null}
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
