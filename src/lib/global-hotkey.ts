import { isTauri, trackedInvoke } from "@/lib/tauri"

export async function readGlobalHotkeyState(code: string) {
  if (!isTauri()) {
    return false
  }

  return trackedInvoke<boolean>("read_global_hotkey_state", { code })
}
