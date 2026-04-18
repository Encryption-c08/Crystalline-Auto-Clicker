import { isTauri, trackedInvoke } from "@/lib/tauri";

export type OpenAppProcess = {
  iconDataUrl: string | null;
  name: string;
};

export async function getForegroundProcessName() {
  if (!isTauri()) {
    return null;
  }

  return trackedInvoke<string | null>("get_foreground_process_name");
}

export async function listOpenAppProcesses() {
  if (!isTauri()) {
    return [];
  }

  return trackedInvoke<OpenAppProcess[]>("list_open_app_processes");
}

export async function listRunningProcessNames() {
  if (!isTauri()) {
    return [];
  }

  return trackedInvoke<string[]>("list_running_process_names");
}

export async function pickProcessNameFromClick() {
  if (!isTauri()) {
    return null;
  }

  return trackedInvoke<string | null>("pick_process_name_from_click");
}
