import type {
  AutoClickerCommandConfig,
  AutoClickerStatus,
} from "@/config/runtime"

import { trackedInvoke } from "@/lib/tauri"

export const EDGE_STOP_TRIGGERED_STATUS_MESSAGE =
  "Edge stop touched. Auto clicker disabled."

export async function configureAutoClicker(config: AutoClickerCommandConfig) {
  return trackedInvoke<AutoClickerStatus>("configure_auto_clicker", { config })
}

export async function getAutoClickerStatus() {
  return trackedInvoke<AutoClickerStatus>("get_auto_clicker_status")
}
