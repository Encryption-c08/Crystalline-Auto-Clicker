import { normalizeWindowOpacityPercent } from "@/config/window-opacity";
import { isTauri, trackedInvoke } from "@/lib/tauri";

export async function setMainWindowOpacity(opacityPercent: number) {
  if (!isTauri()) {
    return;
  }

  return trackedInvoke<void>("set_main_window_opacity", {
    opacity: normalizeWindowOpacityPercent(opacityPercent),
  });
}
