import type { Hotkey } from "@/input/hotkeys"

import { isTauri, trackedInvoke } from "@/lib/tauri"

export async function readPressedKeyboardHotkey() {
  if (!isTauri()) {
    return null
  }

  return trackedInvoke<Hotkey | null>("read_pressed_keyboard_hotkey")
}
