import { invoke, isTauri, type InvokeArgs } from "@tauri-apps/api/core"

export async function trackedInvoke<T>(command: string, args?: InvokeArgs) {
  return invoke<T>(command, args)
}

export { isTauri }
