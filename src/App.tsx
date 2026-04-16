import { useEffect, useState } from "react"

import type { AutoClickerSettings } from "@/config/settings"
import { buildAutoClickerConfig } from "@/config/runtime"
import { PanelFrame } from "@/components/panel-frame"
import { SettingsPanel } from "@/components/settings-panel"
import { TitleBar } from "@/components/title-bar"
import { configureAutoClicker } from "@/lib/auto-clicker"
import { defaultAutoClickerSettings } from "@/config/settings"

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
        <div className="grid min-h-0 gap-3 grid-rows-[auto_1.35fr_82px]">
          <SettingsPanel
            runtimeError={runtimeError}
            setSettings={setSettings}
            settings={settings}
          />

          <PanelFrame className="rounded-md" />

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
