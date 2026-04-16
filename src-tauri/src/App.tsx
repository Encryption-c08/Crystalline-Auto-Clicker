import {
  useEffect,
  useState,
  type ReactNode,
} from "react"

import { getCurrentWindow } from "@tauri-apps/api/window"

import type { AutoClickerSettings } from "../../src/auto-clicker/settings"
import { buildAutoClickerConfig } from "../../src/auto-clicker/runtime"
import { AutoClickerControls } from "@/components/auto-clicker-controls"
import { configureAutoClicker } from "@/lib/auto-clicker"
import { isTauri } from "@/lib/tauri"
import { defaultAutoClickerSettings } from "../../src/auto-clicker/settings"

function Panel({
  children,
  className = "",
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`border border-border/70 bg-card/70 shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}

type WindowAction = "close" | "minimize" | "toggle-maximize"

async function handleWindowAction(action: WindowAction) {
  if (!isTauri()) {
    return
  }

  const appWindow = getCurrentWindow()

  if (action === "close") {
    await appWindow.close()
    return
  }

  if (action === "minimize") {
    await appWindow.minimize()
    return
  }

  await appWindow.toggleMaximize()
}

function MacControlButton({
  action,
  label,
  colorClassName,
}: {
  action: WindowAction
  label: string
  colorClassName: string
}) {
  return (
    <button
      aria-label={label}
      className={`h-3.5 w-3.5 rounded-full transition hover:scale-105 hover:brightness-110 ${colorClassName}`}
      data-window-control
      onClick={() => void handleWindowAction(action)}
      type="button"
    />
  )
}

function TitleBar() {
  const titleText = "Crystalline Auto Clicker"
  const [visibleTitle, setVisibleTitle] = useState("")
  const [isDeletingTitle, setIsDeletingTitle] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")

    function updateMotionPreference() {
      setPrefersReducedMotion(mediaQuery.matches)
    }

    updateMotionPreference()

    mediaQuery.addEventListener("change", updateMotionPreference)

    return () => mediaQuery.removeEventListener("change", updateMotionPreference)
  }, [])

  useEffect(() => {
    if (prefersReducedMotion) {
      setVisibleTitle(titleText)
      setIsDeletingTitle(false)
      return undefined
    }

    let delay = isDeletingTitle ? 45 : 75

    if (!isDeletingTitle && visibleTitle.length >= titleText.length) {
      delay = 1400
    } else if (isDeletingTitle && visibleTitle.length === 0) {
      delay = 350
    }

    const timeoutId = window.setTimeout(() => {
      if (!isDeletingTitle && visibleTitle.length >= titleText.length) {
        setIsDeletingTitle(true)
        return
      }

      if (isDeletingTitle && visibleTitle.length === 0) {
        setIsDeletingTitle(false)
        return
      }

      const nextLength = visibleTitle.length + (isDeletingTitle ? -1 : 1)
      setVisibleTitle(titleText.slice(0, nextLength))
    }, delay)

    return () => window.clearTimeout(timeoutId)
  }, [isDeletingTitle, prefersReducedMotion, titleText, visibleTitle])

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="flex h-11 items-center gap-3 px-4">
        <div
          className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground"
          data-tauri-drag-region
        >
          <span className="inline-flex max-w-full items-center align-middle">
            <span className="titlebar-typewriter truncate whitespace-nowrap">
              {visibleTitle}
            </span>
            <span
              aria-hidden="true"
              className={`titlebar-typewriter-caret ${
                prefersReducedMotion ? "opacity-0" : ""
              }`}
            >
              |
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1.5" data-window-control>
          <MacControlButton
            action="minimize"
            colorClassName="bg-[#febc2e]"
            label="Minimize window"
          />
          <MacControlButton
            action="toggle-maximize"
            colorClassName="bg-[#28c840]"
            label="Toggle maximize"
          />
          <MacControlButton
            action="close"
            colorClassName="bg-[#ff5f57]"
            label="Close window"
          />
        </div>
      </div>
    </header>
  )
}

export default function App() {
  const [settings, setSettings] = useState<AutoClickerSettings>(
    defaultAutoClickerSettings
  )
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  useEffect(() => {
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
    }, 100)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [settings])

  return (
    <div className="h-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="grid h-screen grid-cols-1 gap-3 p-3 pt-[3.5rem]">
        <div className="grid min-h-0 gap-3 grid-rows-[108px_1.35fr_82px]">
          <Panel className="rounded-md p-1.5">
            <AutoClickerControls
              runtimeError={runtimeError}
              setSettings={setSettings}
              settings={settings}
            />
          </Panel>

          <Panel className="rounded-md" />

          <div className="grid min-h-0 gap-3 min-[720px]:grid-cols-[minmax(0,1fr)_180px]">
            <div className="grid min-h-0 gap-3 md:grid-cols-2">
              <Panel className="rounded-md" />
              <Panel className="rounded-md" />
            </div>
            <Panel className="rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}
