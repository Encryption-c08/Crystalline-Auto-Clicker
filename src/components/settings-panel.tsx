import type { Dispatch, SetStateAction } from "react"

import type { AutoClickerSettings } from "@/config/settings"
import type { DisabledDependencyCue } from "@/components/disabled-feature-dependency"
import { PanelFrame } from "@/components/panel-frame"
import { SettingsPanelContent } from "@/components/panels/settings-panel-content"
import { cn } from "@tauri-ui/lib/utils"

export type SettingsPanelLayout = "compact" | "default"

type SettingsPanelProps = {
  disabledDependencyCue: DisabledDependencyCue | null
  layout?: SettingsPanelLayout
  onDisabledDependencyCueConsumed?: () => void
  settings: AutoClickerSettings
  setSettings: Dispatch<SetStateAction<AutoClickerSettings>>
  runtimeError: string | null
}

export function SettingsPanel({
  disabledDependencyCue,
  layout = "default",
  onDisabledDependencyCueConsumed,
  settings,
  setSettings,
  runtimeError,
}: SettingsPanelProps) {
  return (
    <PanelFrame
      className={cn(
        "max-w-full justify-self-start rounded-md",
        layout === "compact" ? "w-[37rem] p-1" : "w-[38.5rem] p-1.5"
      )}
    >
      <SettingsPanelContent
        disabledDependencyCue={disabledDependencyCue}
        layout={layout}
        onDisabledDependencyCueConsumed={onDisabledDependencyCueConsumed}
        runtimeError={runtimeError}
        setSettings={setSettings}
        settings={settings}
      />
    </PanelFrame>
  )
}
