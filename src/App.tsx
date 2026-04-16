import { useEffect, useState } from "react"

import type { AutoClickerSettings } from "@/config/settings"
import { buildAutoClickerConfig } from "@/config/runtime"
import { ClickLimitPanel } from "@/components/click-limit-panel"
import { PanelFrame } from "@/components/panel-frame"
import { SettingsPanel } from "@/components/settings-panel"
import { TitleBar } from "@/components/title-bar"
import { configureAutoClicker } from "@/lib/auto-clicker"
import {
  defaultAutoClickerSettings,
  normalizeAutoClickerSettings,
} from "@/config/settings"
import {
  loadSavedAutoClickerSettings,
  saveAutoClickerSettings,
} from "@/lib/settings-store"

export default function App() {
  const [settings, setSettings] = useState<AutoClickerSettings>(
    defaultAutoClickerSettings
  )
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

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

  return (
    <div className="h-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="grid h-screen grid-cols-1 gap-3 p-3 pt-[3.5rem]">
        <div className="grid min-h-0 gap-3 grid-rows-[auto_auto_1fr]">
          <SettingsPanel
            runtimeError={runtimeError}
            setSettings={setSettings}
            settings={settings}
          />

          <ClickLimitPanel setSettings={setSettings} settings={settings} />

          <div className="grid min-h-0 gap-3 min-[720px]:grid-cols-[minmax(0,1fr)_180px]">
            <div className="grid min-h-0 gap-3 md:grid-cols-2">
              <PanelFrame className="rounded-md" />
              <PanelFrame className="rounded-md" />
            </div>
            <PanelFrame className="rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}
