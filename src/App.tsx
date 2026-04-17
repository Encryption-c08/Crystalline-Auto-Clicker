import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { Settings2Icon } from "lucide-react"

import { ClickDurationPanel } from "@/components/click-duration-panel"
import type {
  DisabledDependencyCue,
  DisabledDependencyTarget,
} from "@/components/disabled-feature-dependency"
import { ClickLimitPanel } from "@/components/click-limit-panel"
import { DoubleClickPanel } from "@/components/double-click-panel"
import { SettingsPanel } from "@/components/settings-panel"
import { TimeLimitPanel } from "@/components/time-limit-panel"
import { TitleBar } from "@/components/title-bar"
import { buildAutoClickerConfig } from "@/config/runtime"
import type { AutoClickerSettings } from "@/config/settings"
import {
  appThemeLabels,
  appThemes,
  defaultAutoClickerSettings,
  normalizeAutoClickerSettings,
} from "@/config/settings"
import { configureAutoClicker } from "@/lib/auto-clicker"
import {
  loadSavedAutoClickerSettings,
  saveAutoClickerSettings,
} from "@/lib/settings-store"
import { isTauri, trackedInvoke } from "@/lib/tauri"
import { useTheme } from "@tauri-ui/components/theme-provider.tsx"
import { ToggleGroup, ToggleGroupItem } from "@tauri-ui/components/ui/toggle-group"
import { cn } from "@tauri-ui/lib/utils"

const DEFAULT_WINDOW_SIZE = {
  height: 680,
  width: 760,
}
const TITLE_BAR_HEIGHT = 44
const DOCK_HEIGHT = 44
const SIMPLE_VIEW_HORIZONTAL_PADDING = 24
const SIMPLE_VIEW_VERTICAL_PADDING = 24
const ADVANCED_PANEL_MIN_WINDOW_WIDTH = 728
const NON_SIMPLE_MIN_WINDOW_HEIGHT = 248
const SIMPLE_MIN_WINDOW_HEIGHT = 200
const SIMPLE_MIN_WINDOW_WIDTH = 560
const ACTIVE_TAB_STORAGE_KEY = "crystalline-auto-clicker.active-tab"

type AppTab = "advanced" | "settings" | "simple"

function normalizeAppTab(value: string | null | undefined): AppTab | null {
  if (value === "simple" || value === "advanced" || value === "settings") {
    return value
  }

  return null
}

function loadInitialActiveTab(): AppTab {
  if (typeof window === "undefined") {
    return "simple"
  }

  try {
    return normalizeAppTab(window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)) ?? "simple"
  } catch {
    return "simple"
  }
}

function clampSimpleWindowHeight(height: number) {
  return Math.max(
    SIMPLE_MIN_WINDOW_HEIGHT,
    Math.min(DEFAULT_WINDOW_SIZE.height, height)
  )
}

function clampSimpleWindowWidth(width: number) {
  return Math.max(
    SIMPLE_MIN_WINDOW_WIDTH,
    Math.min(DEFAULT_WINDOW_SIZE.width, width)
  )
}

function resolveSimpleWindowWidth(contentWidth: number) {
  return clampSimpleWindowWidth(
    Math.ceil(contentWidth + SIMPLE_VIEW_HORIZONTAL_PADDING)
  )
}

function resolveSimpleWindowHeight(contentHeight: number) {
  return clampSimpleWindowHeight(
    Math.ceil(
      contentHeight +
        SIMPLE_VIEW_VERTICAL_PADDING +
        TITLE_BAR_HEIGHT +
        DOCK_HEIGHT
    )
  )
}

function resolveWindowTarget(
  activeTab: AppTab,
  simpleViewWidth: number,
  simpleViewHeight: number
) {
  if (activeTab === "simple") {
    const width = resolveSimpleWindowWidth(simpleViewWidth)
    const height = resolveSimpleWindowHeight(simpleViewHeight)

    return {
      minHeight: height,
      minWidth: width,
      height,
      width,
    }
  }

  return {
    minHeight: NON_SIMPLE_MIN_WINDOW_HEIGHT,
    minWidth: ADVANCED_PANEL_MIN_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_SIZE.height,
    width: DEFAULT_WINDOW_SIZE.width,
  }
}

function DockButton({
  active,
  children,
  className,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  className?: string
  onClick: () => void
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-0",
        active
          ? "bg-muted-foreground/16 text-foreground"
          : "text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground",
        className
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export default function App() {
  const { setTheme, theme } = useTheme()
  const [settings, setSettings] = useState<AutoClickerSettings>(
    defaultAutoClickerSettings
  )
  const [activeTab, setActiveTab] = useState<AppTab>(loadInitialActiveTab)
  const [disabledDependencyCue, setDisabledDependencyCue] =
    useState<DisabledDependencyCue | null>(null)
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [simpleViewWidth, setSimpleViewWidth] = useState(0)
  const [simpleViewHeight, setSimpleViewHeight] = useState(0)
  const simplePanelMeasureRef = useRef<HTMLDivElement | null>(null)

  function highlightDisabledDependency(target: DisabledDependencyTarget) {
    setDisabledDependencyCue({ target })
  }

  function clearDisabledDependencyCue() {
    setDisabledDependencyCue(null)
  }

  useEffect(() => {
    if (theme !== settings.theme) {
      setTheme(settings.theme)
    }
  }, [setTheme, settings.theme, theme])

  useEffect(() => {
    let cancelled = false

    void loadSavedAutoClickerSettings()
      .then((savedSettings) => {
        if (cancelled) {
          return
        }

        setSettings(normalizeAutoClickerSettings(savedSettings))
      })
      .catch((error) => {
        console.error("Unable to load saved settings", error)
      })
      .finally(() => {
        if (!cancelled) {
          setHasLoadedSettings(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedSettings) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void configureAutoClicker(buildAutoClickerConfig(settings))
        .then(() => {
          setRuntimeError(null)
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Unable to start clicker"
          setRuntimeError(message)
        })

      void saveAutoClickerSettings(settings).catch((error) => {
        console.error("Unable to save settings", error)
      })
    }, 100)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [hasLoadedSettings, settings])

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab)
    } catch (error) {
      console.warn("Unable to persist active tab", error)
    }
  }, [activeTab])

  useLayoutEffect(() => {
    if (activeTab !== "simple" || !simplePanelMeasureRef.current) {
      return undefined
    }

    const element = simplePanelMeasureRef.current

    function updateSimpleViewSize() {
      const { height, width } = element.getBoundingClientRect()
      setSimpleViewHeight(Math.ceil(height))
      setSimpleViewWidth(Math.ceil(width))
    }

    updateSimpleViewSize()

    const resizeObserver = new ResizeObserver(() => {
      updateSimpleViewSize()
    })

    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
    }
  }, [activeTab])

  useEffect(() => {
    if (!isTauri()) {
      return undefined
    }

    if (activeTab === "simple" && (simpleViewHeight === 0 || simpleViewWidth === 0)) {
      return undefined
    }

    const target = resolveWindowTarget(activeTab, simpleViewWidth, simpleViewHeight)
    let cancelled = false
    let retryTimeoutId: number | null = null

    async function syncWindowFrame(attempt = 0) {
      try {
        if (cancelled) {
          return
        }

        await trackedInvoke<void>("sync_main_window_frame", {
          frame: {
            height: target.height,
            minHeight: target.minHeight,
            minWidth: target.minWidth,
            width: target.width,
          },
        })
      } catch (error) {
        if (!cancelled && attempt < 8) {
          retryTimeoutId = window.setTimeout(() => {
            void syncWindowFrame(attempt + 1)
          }, 60)
          return
        }

        if (!cancelled) {
          console.error("Unable to sync window frame", error)
        }
      }
    }

    retryTimeoutId = window.setTimeout(() => {
      void syncWindowFrame()
    }, 40)

    return () => {
      cancelled = true
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId)
      }
    }
  }, [activeTab, simpleViewHeight, simpleViewWidth])

  const advancedPanels = (
    <div className="flex w-full max-w-[30rem] flex-col items-stretch gap-3">
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
      <ClickLimitPanel
        onUnavailablePress={highlightDisabledDependency}
        setSettings={setSettings}
        settings={settings}
      />
      <TimeLimitPanel
        onUnavailablePress={highlightDisabledDependency}
        setSettings={setSettings}
        settings={settings}
      />
    </div>
  )

  const settingsPanel = (
    <div className="mx-auto w-full max-w-[30rem]">
      <div className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/35 px-3 py-2 transition-colors">
        <div className="min-w-0 pr-2">
          <p className="text-base font-semibold text-foreground">Theme</p>
          <p className="text-sm text-muted-foreground">
            Choose between dark and light mode.
          </p>
        </div>

        <ToggleGroup
          className="shrink-0 overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-background/60"
          onValueChange={(value) => {
            if (!value) {
              return
            }

            setSettings((current) => ({
              ...current,
              theme: value as AutoClickerSettings["theme"],
            }))
          }}
          size="sm"
          type="single"
          value={settings.theme}
          variant="default"
        >
          {appThemes.map((value) => (
            <ToggleGroupItem
              aria-label={`Set theme to ${appThemeLabels[value]}`}
              className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[state=on]:bg-muted-foreground/15 data-[state=on]:text-foreground focus-visible:ring-0"
              key={value}
              value={value}
            >
              {appThemeLabels[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )

  return (
    <div className="h-screen overflow-hidden bg-background">
      <TitleBar />

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
              <div className="grid content-start gap-3">
                <SettingsPanel
                  disabledDependencyCue={disabledDependencyCue}
                  onDisabledDependencyCueConsumed={clearDisabledDependencyCue}
                  runtimeError={runtimeError}
                  setSettings={setSettings}
                  settings={settings}
                />
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
  )
}
