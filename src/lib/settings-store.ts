import type {
  AutoClickerSettings,
  SavedAutoClickerSettings,
} from "@/config/settings"

import { isTauri, trackedInvoke } from "@/lib/tauri"

export async function loadSavedAutoClickerSettings() {
  if (!isTauri()) {
    return null
  }

  return trackedInvoke<SavedAutoClickerSettings | null>(
    "load_auto_clicker_settings"
  )
}

export async function saveAutoClickerSettings(settings: AutoClickerSettings) {
  if (!isTauri()) {
    return
  }

  return trackedInvoke<void>("save_auto_clicker_settings", { settings })
}

export async function stageAutoClickerSettings(settings: AutoClickerSettings) {
  if (!isTauri()) {
    return
  }

  return trackedInvoke<void>("stage_auto_clicker_settings", { settings })
}
