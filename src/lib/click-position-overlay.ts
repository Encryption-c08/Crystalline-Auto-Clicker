import type { ClickPosition } from "@/config/settings"
import { isTauri, trackedInvoke } from "@/lib/tauri"

export const CLICK_POSITION_OVERLAY_UPDATE_EVENT =
  "click-position-overlay:update"
export const CLICK_POSITION_OVERLAY_MOVE_EVENT =
  "click-position-overlay:move-dot"

export type ScreenPoint = {
  x: number
  y: number
}

export type ClickPositionOverlayMoveEvent = {
  id: number
  x: number
  y: number
}

export type ClickPositionOverlayState = {
  editable: boolean
  height: number
  originX: number
  originY: number
  positions: ClickPosition[]
  visible: boolean
  width: number
}

const EMPTY_OVERLAY_STATE: ClickPositionOverlayState = {
  editable: false,
  height: 0,
  originX: 0,
  originY: 0,
  positions: [],
  visible: false,
  width: 0,
}

export async function syncClickPositionOverlay(
  overlay: Pick<ClickPositionOverlayState, "editable" | "positions" | "visible">
) {
  if (!isTauri()) {
    return
  }

  return trackedInvoke<void>("sync_click_position_overlay", { overlay })
}

export async function getClickPositionOverlayState() {
  if (!isTauri()) {
    return { ...EMPTY_OVERLAY_STATE }
  }

  return trackedInvoke<ClickPositionOverlayState>(
    "get_click_position_overlay_state"
  )
}

export async function getCurrentCursorPosition() {
  if (!isTauri()) {
    return { x: 0, y: 0 } satisfies ScreenPoint
  }

  return trackedInvoke<ScreenPoint>("get_current_cursor_position")
}

export async function setClickPositionOverlayInteractive(interactive: boolean) {
  if (!isTauri()) {
    return
  }

  return trackedInvoke<void>("set_click_position_overlay_interactive", {
    interactive,
  })
}

export function emptyClickPositionOverlayState() {
  return { ...EMPTY_OVERLAY_STATE }
}
