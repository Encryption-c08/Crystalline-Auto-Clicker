import {
  invoke,
  isTauri as coreIsTauri,
  type InvokeArgs,
} from "@tauri-apps/api/core"

export async function trackedInvoke<T>(command: string, args?: InvokeArgs) {
  return invoke<T>(command, args)
}

export function isTauri() {
  if (typeof window === "undefined") {
    return false
  }

  return (
    coreIsTauri() ||
    "__TAURI_INTERNALS__" in window ||
    "__TAURI__" in window
  )
}
