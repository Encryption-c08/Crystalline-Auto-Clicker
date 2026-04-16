import type { Dispatch, SetStateAction } from "react"

import type { AutoClickerSettings } from "@/config/settings"
import { PanelFrame } from "@/components/panel-frame"
import { SettingsPanelContent } from "@/components/panels/settings-panel-content"

type SettingsPanelProps = {
  settings: AutoClickerSettings
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>
  runtimeError: string | null
}

export function SettingsPanel({
  settings,
  setSettings,
  runtimeError,
}: SettingsPanelProps) {
  return (
    <PanelFrame className="rounded-md p-1.5">
      <SettingsPanelContent
        runtimeError={runtimeError}
        setSettings={setSettings}
        settings={settings}
      />
    </PanelFrame>
  )
}
