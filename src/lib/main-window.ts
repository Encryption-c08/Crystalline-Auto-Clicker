import { getCurrentWindow } from "@tauri-apps/api/window";

import { normalizeWindowOpacityPercent } from "@/config/window-opacity";
import { isTauri, trackedInvoke } from "@/lib/tauri";

export async function isMainWindowAlwaysOnTop() {
  if (!isTauri()) {
    return false;
  }

  return getCurrentWindow().isAlwaysOnTop();
}

export async function setMainWindowAlwaysOnTop(
  alwaysOnTop: boolean,
  opacityPercent: number,
) {
  if (!isTauri()) {
    return;
  }

  return trackedInvoke<void>("set_main_window_always_on_top", {
    request: {
      alwaysOnTop,
      opacity: normalizeWindowOpacityPercent(opacityPercent),
    },
  });
}
