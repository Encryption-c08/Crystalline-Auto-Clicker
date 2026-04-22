import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { listen } from "@tauri-apps/api/event";
import { Settings2Icon } from "lucide-react";

import { ClickDurationPanel } from "@/components/click-duration-panel";
import { ClickRegionPanel } from "@/components/click-region-panel";
import { CloseToTrayPanel } from "@/components/close-to-tray-panel";
import type {
  DisabledDependencyCue,
  DisabledDependencyTarget,
} from "@/components/disabled-feature-dependency";
import { DoubleClickPanel } from "@/components/double-click-panel";
import { EdgeStopPanel } from "@/components/edge-stop-panel";
import { JitterPanel } from "@/components/jitter-panel";
import { ProcessFilterPanel } from "@/components/process-filter-panel";
import { LimitsPanel } from "@/components/limits-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { ThemePanel } from "@/components/theme-panel";
import { TitleBar } from "@/components/title-bar";
import {
  buildAutoClickerConfig,
  buildEdgeStopConfig,
  buildEdgeStopOverlayConfig,
  buildEdgeStopPreviewOverlayConfig,
  hasActiveEdgeStopConfig,
} from "@/config/runtime";
import type { AutoClickerSettings } from "@/config/settings";
import {
  defaultAutoClickerSettings,
  isProcessAllowedByRules,
  normalizeAutoClickerSettings,
  resolveEnabledProcessRules,
} from "@/config/settings";
import {
  applyThemeCssVariables,
  buildOverlayVisualTheme,
  buildThemeCssVariables,
} from "@/config/theme";
import { configureAutoClicker, getAutoClickerStatus } from "@/lib/auto-clicker";
import {
  CLICK_POSITION_OVERLAY_MOVE_EVENT,
  CLICK_POSITION_OVERLAY_REGION_CANCEL_EVENT,
  CLICK_POSITION_OVERLAY_REGION_CONFIRM_EVENT,
  type ClickPositionOverlayMoveEvent,
  type ClickPositionOverlayRegionCancelEvent,
  type ClickPositionOverlayRegionConfirmEvent,
  getClickPositionOverlayState,
  getCurrentCursorPosition,
  syncClickPositionOverlay,
} from "@/lib/click-position-overlay";
import {
  createDefaultClickRegion,
  isClickRegionValid,
  resolveOverlayBounds,
} from "@/lib/click-region";
import { readGlobalHotkeyState } from "@/lib/global-hotkey";
import {
  getForegroundProcessName,
  listOpenAppProcesses,
  listRunningProcessNames,
  type OpenAppProcess,
} from "@/lib/process-filters";
import {
  loadSavedAutoClickerSettings,
  saveAutoClickerSettings,
  stageAutoClickerSettings,
} from "@/lib/settings-store";
import { setMainWindowOpacity } from "@/lib/window-opacity";
import { matchesKeyboardEventHotkey } from "@/input/hotkeys";
import { isTauri, trackedInvoke } from "@/lib/tauri";
import { useTheme } from "@tauri-ui/components/theme-provider.tsx";
import { cn } from "@tauri-ui/lib/utils";

const DEFAULT_WINDOW_HEIGHT = 680;
const DEFAULT_ADVANCED_WINDOW_WIDTH = 1024;
const DEFAULT_STANDARD_WINDOW_WIDTH = 760;
const TITLE_BAR_HEIGHT = 44;
const DOCK_HEIGHT = 44;
const SIMPLE_VIEW_HORIZONTAL_PADDING = 24;
const SIMPLE_VIEW_VERTICAL_PADDING = 24;
const ADVANCED_PANEL_MIN_WINDOW_WIDTH = 1008;
const NON_SIMPLE_MIN_WINDOW_HEIGHT = 248;
const SIMPLE_MIN_WINDOW_HEIGHT = 200;
const SIMPLE_MIN_WINDOW_WIDTH = 560;
const ACTIVE_TAB_STORAGE_KEY = "crystalline-auto-clicker.active-tab";
const AUTO_CLICKER_STATUS_POLL_MS = 80;

type AppTab = "advanced" | "settings" | "simple";

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

function normalizeAppTab(value: string | null | undefined): AppTab | null {
  if (value === "simple" || value === "advanced" || value === "settings") {
    return value;
  }

  return null;
}

function loadInitialActiveTab(): AppTab {
  if (typeof window === "undefined") {
    return "simple";
  }

  try {
    return (
      normalizeAppTab(window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)) ??
      "simple"
    );
  } catch {
    return "simple";
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function clampSimpleWindowHeight(height: number) {
  return Math.max(
    SIMPLE_MIN_WINDOW_HEIGHT,
    Math.min(DEFAULT_WINDOW_HEIGHT, height),
  );
}

function clampSimpleWindowWidth(width: number) {
  return Math.max(
    SIMPLE_MIN_WINDOW_WIDTH,
    Math.min(DEFAULT_STANDARD_WINDOW_WIDTH, width),
  );
}

function resolveSimpleWindowWidth(contentWidth: number) {
  return clampSimpleWindowWidth(
    Math.ceil(contentWidth + SIMPLE_VIEW_HORIZONTAL_PADDING),
  );
}

function resolveSimpleWindowHeight(contentHeight: number) {
  return clampSimpleWindowHeight(
    Math.ceil(
      contentHeight +
        SIMPLE_VIEW_VERTICAL_PADDING +
        TITLE_BAR_HEIGHT +
        DOCK_HEIGHT,
    ),
  );
}

function resolveWindowTarget(
  activeTab: AppTab,
  simpleViewWidth: number,
  simpleViewHeight: number,
) {
  if (activeTab === "simple") {
    const width = resolveSimpleWindowWidth(simpleViewWidth);
    const height = resolveSimpleWindowHeight(simpleViewHeight);

    return {
      minHeight: height,
      minWidth: width,
      height,
      width,
    };
  }

  return {
    minHeight: NON_SIMPLE_MIN_WINDOW_HEIGHT,
    minWidth: ADVANCED_PANEL_MIN_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    width: DEFAULT_ADVANCED_WINDOW_WIDTH,
  };
}

function DockButton({
  active,
  children,
  className,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-0",
        active
          ? "bg-muted-foreground/16 text-foreground"
          : "text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export default function App() {
  const { setTheme, theme } = useTheme();
  const [settings, setSettings] = useState<AutoClickerSettings>(
    defaultAutoClickerSettings,
  );
  const [activeTab, setActiveTab] = useState<AppTab>(loadInitialActiveTab);
  const [disabledDependencyCue, setDisabledDependencyCue] =
    useState<DisabledDependencyCue | null>(null);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [focusedProcessName, setFocusedProcessName] = useState<string | null>(
    null,
  );
  const [openAppProcesses, setOpenAppProcesses] = useState<OpenAppProcess[]>(
    [],
  );
  const [runningProcessNames, setRunningProcessNames] = useState<string[]>([]);
  const [processListLoading, setProcessListLoading] = useState(false);
  const [processListError, setProcessListError] = useState<string | null>(null);
  const [simpleViewWidth, setSimpleViewWidth] = useState(0);
  const [simpleViewHeight, setSimpleViewHeight] = useState(0);
  const [isAutoClickerRunning, setIsAutoClickerRunning] = useState(false);
  const [isMainWindowReady, setIsMainWindowReady] = useState(false);
  const [edgeStopThemePreviewActive, setEdgeStopThemePreviewActive] =
    useState(false);
  const [isClickRegionEditing, setIsClickRegionEditing] = useState(false);
  const hasShownMainWindowRef = useRef(false);
  const simplePanelMeasureRef = useRef<HTMLDivElement | null>(null);
  const resolvedThemeStyles = useMemo(
    () => buildThemeCssVariables(settings.themeColors),
    [settings.themeColors],
  );
  const overlayVisualTheme = useMemo(
    () => buildOverlayVisualTheme(settings.themeColors),
    [settings.themeColors],
  );

  function highlightDisabledDependency(target: DisabledDependencyTarget) {
    setDisabledDependencyCue({ target });
  }

  function clearDisabledDependencyCue() {
    setDisabledDependencyCue(null);
  }

  function appendClickPosition(x: number, y: number) {
    setSettings((current) => {
      const nextId =
        current.clickPositions.reduce(
          (maxId, position) => Math.max(maxId, position.id),
          0,
        ) + 1;

      return {
        ...current,
        clickPositionEnabled: true,
        clickPositions: [
          ...current.clickPositions,
          {
            id: nextId,
            x: Math.round(x),
            y: Math.round(y),
          },
        ],
      };
    });
  }

  async function addCenteredClickPosition() {
    try {
      const overlayState = await getClickPositionOverlayState();
      const centerX =
        overlayState.originX +
        Math.round((overlayState.width || window.screen.availWidth) / 2);
      const centerY =
        overlayState.originY +
        Math.round((overlayState.height || window.screen.availHeight) / 2);

      appendClickPosition(centerX, centerY);
    } catch (error) {
      console.error("Unable to add centered click position", error);
    }
  }

  function removeMostRecentClickPosition() {
    setSettings((current) => {
      if (current.clickPositions.length === 0) {
        return current;
      }

      const highestId = current.clickPositions.reduce(
        (maxId, position) => Math.max(maxId, position.id),
        0,
      );
      const nextPositions = current.clickPositions.filter(
        (position) => position.id !== highestId,
      );

      return {
        ...current,
        clickPositionEnabled: nextPositions.length > 0,
        clickPositions: nextPositions,
      };
    });
  }

  function clearAllClickPositions() {
    setSettings((current) => ({
      ...current,
      clickPositionEnabled: false,
      clickPositions: [],
    }));
  }

  async function resolveDefaultClickRegion() {
    const overlayState = await getClickPositionOverlayState().catch(() => null);
    return createDefaultClickRegion(resolveOverlayBounds(overlayState));
  }

  async function ensureClickRegionInitialized() {
    const nextRegion = await resolveDefaultClickRegion();

    setSettings((current) => {
      if (isClickRegionValid(current.clickRegion)) {
        return current;
      }

      return {
        ...current,
        clickRegion: nextRegion,
      };
    });
  }

  async function enableClickRegion() {
    await ensureClickRegionInitialized();
    setSettings((current) => ({
      ...current,
      clickRegionEnabled: true,
    }));
  }

  async function startClickRegionEditing() {
    if (isClickRegionEditing) {
      return;
    }

    await enableClickRegion();
    setIsClickRegionEditing(true);
  }

  async function resetClickRegion() {
    const nextRegion = await resolveDefaultClickRegion();
    setSettings((current) => ({
      ...current,
      clickRegion: nextRegion,
    }));
  }

  useEffect(() => {
    if (theme !== settings.theme) {
      setTheme(settings.theme);
    }
  }, [setTheme, settings.theme, theme]);

  useLayoutEffect(() => {
    applyThemeCssVariables(document.documentElement, resolvedThemeStyles);
  }, [resolvedThemeStyles]);

  useEffect(() => {
    let cancelled = false;

    void loadSavedAutoClickerSettings()
      .then((savedSettings) => {
        if (cancelled) {
          return;
        }

        setSettings(normalizeAutoClickerSettings(savedSettings));
      })
      .catch((error) => {
        console.error("Unable to load saved settings", error);
      })
      .finally(() => {
        if (!cancelled) {
          setHasLoadedSettings(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return undefined;
    }

    let cancelled = false;
    let pollTimeoutId: number | null = null;

    async function pollAutoClickerStatus() {
      try {
        const status = await getAutoClickerStatus();
        if (!cancelled) {
          setIsAutoClickerRunning(status.clickerActive);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to read auto clicker status", error);
        }
      } finally {
        if (!cancelled) {
          pollTimeoutId = window.setTimeout(() => {
            void pollAutoClickerStatus();
          }, AUTO_CLICKER_STATUS_POLL_MS);
        }
      }
    }

    void pollAutoClickerStatus();

    return () => {
      cancelled = true;
      if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return undefined;
    }

    let cancelled = false;
    let pollTimeoutId: number | null = null;

    async function pollFocusedProcessName() {
      try {
        const nextProcessName = await getForegroundProcessName();
        if (cancelled) {
          return;
        }

        setFocusedProcessName((current) =>
          current === nextProcessName ? current : nextProcessName,
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to read focused process name", error);
        }
      } finally {
        if (!cancelled) {
          pollTimeoutId = window.setTimeout(() => {
            void pollFocusedProcessName();
          }, 250);
        }
      }
    }

    void pollFocusedProcessName();

    return () => {
      cancelled = true;
      if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return undefined;
    }

    let cancelled = false;
    let dispose: (() => void) | undefined;

    void listen<ClickPositionOverlayRegionConfirmEvent>(
      CLICK_POSITION_OVERLAY_REGION_CONFIRM_EVENT,
      (event) => {
        if (cancelled) {
          return;
        }

        const confirmedRegion = isClickRegionValid(event.payload.region)
          ? event.payload.region
          : null;

        if (confirmedRegion) {
          setSettings((current) => ({
            ...current,
            clickRegion:
              current.clickRegion &&
              current.clickRegion.x === confirmedRegion.x &&
              current.clickRegion.y === confirmedRegion.y &&
              current.clickRegion.width === confirmedRegion.width &&
              current.clickRegion.height === confirmedRegion.height
                ? current.clickRegion
                : confirmedRegion,
          }));
        }

        setIsClickRegionEditing(false);
      },
    ).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }

      dispose = unlisten;
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return undefined;
    }

    let cancelled = false;
    let dispose: (() => void) | undefined;

    void listen<ClickPositionOverlayRegionCancelEvent>(
      CLICK_POSITION_OVERLAY_REGION_CANCEL_EVENT,
      () => {
        if (cancelled) {
          return;
        }

        setIsClickRegionEditing(false);
      },
    ).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }

      dispose = unlisten;
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "settings") {
      return undefined;
    }

    let cancelled = false;
    let refreshIntervalId: number | null = null;

    async function refreshProcessLists(showLoadingIndicator: boolean) {
      if (showLoadingIndicator) {
        setProcessListLoading(true);
      }

      const [openAppsResult, allProcessesResult] = await Promise.allSettled([
        listOpenAppProcesses(),
        listRunningProcessNames(),
      ]);

      if (cancelled) {
        return;
      }

      const nextErrors: string[] = [];

      if (openAppsResult.status === "fulfilled") {
        setOpenAppProcesses(openAppsResult.value);
      } else {
        console.error("Unable to list open apps", openAppsResult.reason);
        nextErrors.push(
          `Open apps: ${errorMessage(
            openAppsResult.reason,
            "Unable to list open apps.",
          )}`,
        );
      }

      if (allProcessesResult.status === "fulfilled") {
        setRunningProcessNames(allProcessesResult.value);
      } else {
        console.error(
          "Unable to list running processes",
          allProcessesResult.reason,
        );
        nextErrors.push(
          `All processes: ${errorMessage(
            allProcessesResult.reason,
            "Unable to list running processes.",
          )}`,
        );
      }

      setProcessListError(nextErrors.length > 0 ? nextErrors.join(" ") : null);

      if (showLoadingIndicator) {
        setProcessListLoading(false);
      }
    }

    void refreshProcessLists(true);
    refreshIntervalId = window.setInterval(() => {
      void refreshProcessLists(false);
    }, 5000);

    return () => {
      cancelled = true;
      if (refreshIntervalId !== null) {
        window.clearInterval(refreshIntervalId);
      }
    };
  }, [activeTab]);

  useEffect(() => {
    if (!hasLoadedSettings) {
      return;
    }

    void stageAutoClickerSettings(settings).catch((error) => {
      console.error("Unable to stage settings", error);
    });
  }, [hasLoadedSettings, settings]);

  useEffect(() => {
    if (!hasLoadedSettings) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void configureAutoClicker(buildAutoClickerConfig(settings))
        .then(() => {
          setRuntimeError(null);
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Unable to start clicker";
          setRuntimeError(message);
        });

      void saveAutoClickerSettings(settings).catch((error) => {
        console.error("Unable to save settings", error);
      });
    }, 100);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasLoadedSettings, settings]);

  useEffect(() => {
    if (settings.mouseAction !== "click" || !settings.clickRegionEnabled) {
      setIsClickRegionEditing(false);
    }
  }, [settings.clickRegionEnabled, settings.mouseAction]);

  useEffect(() => {
    if (!isClickRegionEditing) {
      return undefined;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsClickRegionEditing(false);
    }

    window.addEventListener("keydown", handleEscape, true);

    return () => {
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [isClickRegionEditing]);

  useEffect(() => {
    if (!hasLoadedSettings || !isMainWindowReady) {
      return;
    }

    void setMainWindowOpacity(settings.windowOpacity).catch((error) => {
      console.error("Unable to update main window opacity", error);
    });
  }, [hasLoadedSettings, isMainWindowReady, settings.windowOpacity]);

  useEffect(() => {
    if (!hasLoadedSettings) {
      return;
    }

    const { blacklist, whitelist } = resolveEnabledProcessRules(settings);
    const processRulesAllowFocusedProcess = isProcessAllowedByRules(
      focusedProcessName,
      whitelist,
      blacklist,
    );
    const edgeStop = buildEdgeStopConfig(settings);
    const overlayEdgeStop = edgeStopThemePreviewActive
      ? buildEdgeStopPreviewOverlayConfig(settings)
      : buildEdgeStopOverlayConfig(settings);
    const clickPositionPlaybackActive =
      settings.mouseAction === "click" && settings.clickPositions.length > 0;
    const clickPositionOverlayVisible =
      settings.clickPositionDotsVisible &&
      settings.clickPositions.length > 0 &&
      processRulesAllowFocusedProcess;
    const clickRegionOverlayVisible =
      settings.mouseAction === "click" &&
      settings.clickRegionEnabled &&
      isClickRegionValid(settings.clickRegion) &&
      processRulesAllowFocusedProcess;
    const clickRegionEditable =
      isClickRegionEditing &&
      settings.mouseAction === "click" &&
      processRulesAllowFocusedProcess;

    void syncClickPositionOverlay({
      clickRegion:
        clickRegionOverlayVisible || clickRegionEditable
          ? settings.clickRegion
          : null,
      edgeStop: overlayEdgeStop,
      editable: clickRegionEditable,
      positions: settings.clickPositions,
      positionsInteractive:
        settings.clickPositions.length > 0 &&
        !(clickPositionPlaybackActive && isAutoClickerRunning),
      theme: overlayVisualTheme,
      visible:
        clickPositionOverlayVisible ||
        clickRegionOverlayVisible ||
        clickRegionEditable ||
        hasActiveEdgeStopConfig(edgeStop) ||
        edgeStopThemePreviewActive,
    }).catch((error) => {
      console.error("Unable to sync click position overlay", error);
    });
  }, [
    isClickRegionEditing,
    edgeStopThemePreviewActive,
    overlayVisualTheme,
    focusedProcessName,
    hasLoadedSettings,
    isAutoClickerRunning,
    settings,
  ]);

  useEffect(() => {
    if (!isTauri()) {
      return undefined;
    }

    let cancelled = false;
    let dispose: (() => void) | undefined;

    void listen<ClickPositionOverlayMoveEvent>(
      CLICK_POSITION_OVERLAY_MOVE_EVENT,
      (event) => {
        if (cancelled) {
          return;
        }

        setSettings((current) => ({
          ...current,
          clickPositions: current.clickPositions.map((position) =>
            position.id === event.payload.id
              ? {
                  ...position,
                  x: Math.round(event.payload.x),
                  y: Math.round(event.payload.y),
                }
              : position,
          ),
        }));
      },
    ).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }

      dispose = unlisten;
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedSettings) {
      return undefined;
    }

    const shouldEnableClickPositions = settings.clickPositions.length > 0;
    if (settings.clickPositionEnabled === shouldEnableClickPositions) {
      return undefined;
    }

    setSettings((current) => {
      const currentShouldEnableClickPositions =
        current.clickPositions.length > 0;

      if (current.clickPositionEnabled === currentShouldEnableClickPositions) {
        return current;
      }

      return {
        ...current,
        clickPositionEnabled: currentShouldEnableClickPositions,
      };
    });

    return undefined;
  }, [
    hasLoadedSettings,
    setSettings,
    settings.clickPositionEnabled,
    settings.clickPositions.length,
  ]);

  useEffect(() => {
    if (!hasLoadedSettings) {
      return undefined;
    }

    const hasLegacyNonIntrusiveState =
      settings.clickPositionNonIntrusivePositions.length > 0 ||
      settings.clickPositionNonIntrusiveSourcePositions.length > 0 ||
      settings.clickPositionNonIntrusiveTarget !== null;
    const shouldDisableNonIntrusiveMode =
      settings.mouseAction !== "click" || settings.clickPositions.length === 0;

    if (!shouldDisableNonIntrusiveMode && !hasLegacyNonIntrusiveState) {
      return undefined;
    }

    setSettings((current) => {
      const currentHasLegacyNonIntrusiveState =
        current.clickPositionNonIntrusivePositions.length > 0 ||
        current.clickPositionNonIntrusiveSourcePositions.length > 0 ||
        current.clickPositionNonIntrusiveTarget !== null;
      const currentShouldDisableNonIntrusiveMode =
        current.mouseAction !== "click" ||
        current.clickPositions.length === 0;

      if (
        !currentShouldDisableNonIntrusiveMode &&
        !currentHasLegacyNonIntrusiveState
      ) {
        return current;
      }

      return {
        ...current,
        clickPositionNonIntrusiveEnabled: currentShouldDisableNonIntrusiveMode
          ? false
          : current.clickPositionNonIntrusiveEnabled,
        clickPositionNonIntrusivePositions: [],
        clickPositionNonIntrusiveSourcePositions: [],
        clickPositionNonIntrusiveTarget: null,
      };
    });

    return undefined;
  }, [
    hasLoadedSettings,
    setSettings,
    settings.clickPositionNonIntrusiveEnabled,
    settings.clickPositionNonIntrusivePositions,
    settings.clickPositionNonIntrusiveSourcePositions,
    settings.clickPositionNonIntrusiveTarget,
    settings.clickPositions,
    settings.mouseAction,
  ]);

  useEffect(() => {
    if (!hasLoadedSettings) {
      return undefined;
    }

    if (!isTauri()) {
      return undefined;
    }

    const hotkeyCode = settings.clickPositionHotkey.code.trim();
    if (hotkeyCode === "") {
      return undefined;
    }

    let cancelled = false;
    let pollTimeoutId: number | null = null;
    let lastPressed = false;

    async function addCursorDotFromGlobalHotkey() {
      try {
        const cursorPosition = await getCurrentCursorPosition();
        if (cancelled) {
          return;
        }

        appendClickPosition(cursorPosition.x, cursorPosition.y);
      } catch (error) {
        console.error("Unable to add click position at cursor", error);
      }
    }

    async function pollHotkeyState() {
      try {
        const activeElement = document.activeElement;
        const isCapturingDotHotkey =
          activeElement instanceof HTMLElement &&
          activeElement.hasAttribute("data-click-position-hotkey-capture");
        const isPressed = isCapturingDotHotkey
          ? false
          : await readGlobalHotkeyState(hotkeyCode);

        if (cancelled) {
          return;
        }

        if (isPressed && !lastPressed) {
          lastPressed = true;
          void addCursorDotFromGlobalHotkey();
        } else if (!isPressed) {
          lastPressed = false;
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to poll global click-position hotkey", error);
        }
        lastPressed = false;
      } finally {
        if (!cancelled) {
          pollTimeoutId = window.setTimeout(() => {
            void pollHotkeyState();
          }, 25);
        }
      }
    }

    void pollHotkeyState();

    return () => {
      cancelled = true;
      if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
      }
    };
  }, [hasLoadedSettings, settings.clickPositionHotkey.code]);

  useEffect(() => {
    function handleReservedBrowserShortcut(event: KeyboardEvent) {
      if (
        !["F3", "F7"].includes(event.key) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
    }

    window.addEventListener("keydown", handleReservedBrowserShortcut, true);

    return () => {
      window.removeEventListener(
        "keydown",
        handleReservedBrowserShortcut,
        true,
      );
    };
  }, []);

  useEffect(() => {
    const hotkeyCode = settings.clickPositionHotkey.code.trim();
    if (hotkeyCode === "") {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableElement(event.target)) {
        return;
      }

      const activeElement = document.activeElement;
      const isCapturingDotHotkey =
        activeElement instanceof HTMLElement &&
        activeElement.hasAttribute("data-click-position-hotkey-capture");
      if (isCapturingDotHotkey) {
        return;
      }

      if (!matchesKeyboardEventHotkey(event, hotkeyCode)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [settings.clickPositionHotkey.code]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch (error) {
      console.warn("Unable to persist active tab", error);
    }
  }, [activeTab]);

  useLayoutEffect(() => {
    if (activeTab !== "simple" || !simplePanelMeasureRef.current) {
      return undefined;
    }

    const element = simplePanelMeasureRef.current;

    function updateSimpleViewSize() {
      const { height, width } = element.getBoundingClientRect();
      setSimpleViewHeight(Math.ceil(height));
      setSimpleViewWidth(Math.ceil(width));
    }

    updateSimpleViewSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSimpleViewSize();
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeTab]);

  useEffect(() => {
    if (!isTauri()) {
      return undefined;
    }

    if (
      activeTab === "simple" &&
      (simpleViewHeight === 0 || simpleViewWidth === 0)
    ) {
      return undefined;
    }

    const target = resolveWindowTarget(
      activeTab,
      simpleViewWidth,
      simpleViewHeight,
    );
    let cancelled = false;
    let retryTimeoutId: number | null = null;

    async function ensureMainWindowVisible() {
      if (cancelled || hasShownMainWindowRef.current) {
        return;
      }

      try {
        await trackedInvoke<void>("notify_webview_ready");
        hasShownMainWindowRef.current = true;
        setIsMainWindowReady(true);
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to show main window after frame sync", error);
        }
      }
    }

    async function syncWindowFrame(attempt = 0) {
      try {
        if (cancelled) {
          return;
        }

        await trackedInvoke<void>("sync_main_window_frame", {
          frame: {
            animate: hasShownMainWindowRef.current,
            height: target.height,
            minHeight: target.minHeight,
            minWidth: target.minWidth,
            width: target.width,
          },
        });

        await ensureMainWindowVisible();
      } catch (error) {
        if (!cancelled && attempt < 8) {
          retryTimeoutId = window.setTimeout(() => {
            void syncWindowFrame(attempt + 1);
          }, 60);
          return;
        }

        if (!cancelled) {
          console.error("Unable to sync window frame", error);
        }

        await ensureMainWindowVisible();
      }
    }

    retryTimeoutId = window.setTimeout(() => {
      void syncWindowFrame();
    }, 40);

    return () => {
      cancelled = true;
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [activeTab, simpleViewHeight, simpleViewWidth]);

  const advancedPanels = (
    <div className="grid w-full grid-cols-2 items-stretch gap-3">
      <DoubleClickPanel
        onUnavailablePress={highlightDisabledDependency}
        setSettings={setSettings}
        settings={settings}
      />
      <ClickDurationPanel
        onUnavailablePress={highlightDisabledDependency}
        setSettings={setSettings}
        settings={settings}
      />
      <JitterPanel
        onUnavailablePress={highlightDisabledDependency}
        setSettings={setSettings}
        settings={settings}
      />
      <EdgeStopPanel setSettings={setSettings} settings={settings} />
      <ClickRegionPanel
        isEditing={isClickRegionEditing}
        onEditStart={() => void startClickRegionEditing()}
        onEnable={() => void enableClickRegion()}
        onReset={() => void resetClickRegion()}
        onUnavailablePress={highlightDisabledDependency}
        setSettings={setSettings}
        settings={settings}
      />
    </div>
  );

  const settingsPanel = (
    <div className="mx-auto grid w-full max-w-[61rem] items-start gap-3 md:grid-cols-2">
      <ThemePanel
        onEdgeStopPreviewActiveChange={setEdgeStopThemePreviewActive}
        setSettings={setSettings}
        settings={settings}
      />

      <CloseToTrayPanel setSettings={setSettings} settings={settings} />

      <div className="md:col-span-2">
        <ProcessFilterPanel
          allProcessNames={runningProcessNames}
          openAppProcesses={openAppProcesses}
          processListError={processListError}
          processListLoading={processListLoading}
          setSettings={setSettings}
          settings={settings}
        />
      </div>
    </div>
  );

  return (
    <div className="h-screen overflow-hidden bg-background">
      <TitleBar
        closeToTrayEnabled={settings.closeToTray}
        windowOpacity={settings.windowOpacity}
      />

      <div className="flex h-full flex-col pt-11">
        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab === "simple" ? (
            <div className="ui-scrollbar-hidden h-full overflow-y-auto">
              <div className="flex justify-center px-3 pb-3 pt-3">
                <div ref={simplePanelMeasureRef}>
                  <SettingsPanel
                    disabledDependencyCue={disabledDependencyCue}
                    layout="compact"
                    onDisabledDependencyCueConsumed={clearDisabledDependencyCue}
                    runtimeError={runtimeError}
                    setSettings={setSettings}
                    settings={settings}
                  />
                </div>
              </div>
            </div>
          ) : activeTab === "advanced" ? (
            <div className="ui-scrollbar-hidden h-full overflow-y-auto px-3 pb-3 pt-3">
              <div className="mx-auto grid w-full max-w-[61rem] content-start gap-3">
                <div className="grid items-stretch gap-3 [grid-template-columns:38.5rem_minmax(0,1fr)]">
                  <SettingsPanel
                    clickPositionControls={{
                      onAddCenteredDot: () => void addCenteredClickPosition(),
                      onClearDots: clearAllClickPositions,
                      onRemoveDot: removeMostRecentClickPosition,
                    }}
                    disabledDependencyCue={disabledDependencyCue}
                    onDisabledDependencyCueConsumed={clearDisabledDependencyCue}
                    runtimeError={runtimeError}
                    setSettings={setSettings}
                    settings={settings}
                  />
                  <LimitsPanel
                    onUnavailablePress={highlightDisabledDependency}
                    setSettings={setSettings}
                    settings={settings}
                  />
                </div>
                {advancedPanels}
              </div>
            </div>
          ) : (
            <div className="ui-scrollbar-hidden h-full overflow-y-auto px-3 pb-3 pt-3">
              {settingsPanel}
            </div>
          )}
        </div>

        <div className="relative flex h-11 shrink-0 items-center border-t border-border/80 bg-background/94 px-3 backdrop-blur-sm">
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
            <DockButton
              active={activeTab === "simple"}
              onClick={() => setActiveTab("simple")}
            >
              Simple
            </DockButton>
            <DockButton
              active={activeTab === "advanced"}
              onClick={() => setActiveTab("advanced")}
            >
              Advanced
            </DockButton>
          </div>

          <div className="ml-auto">
            <DockButton
              active={activeTab === "settings"}
              className="pl-2.5"
              onClick={() => setActiveTab("settings")}
            >
              <Settings2Icon className="size-4" />
              <span>Settings</span>
            </DockButton>
          </div>
        </div>
      </div>
    </div>
  );
}
