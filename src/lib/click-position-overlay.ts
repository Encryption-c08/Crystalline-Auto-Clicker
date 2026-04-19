import type { ClickPosition } from "@/config/settings";
import {
  defaultOverlayVisualTheme,
  type OverlayVisualTheme,
} from "@/config/theme";
import { isTauri, trackedInvoke } from "@/lib/tauri";

export const CLICK_POSITION_OVERLAY_UPDATE_EVENT =
  "click-position-overlay:update";
export const CLICK_POSITION_OVERLAY_MOVE_EVENT =
  "click-position-overlay:move-dot";

export type ScreenPoint = {
  x: number;
  y: number;
};

export type OverlayRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type ClickPositionOverlayMoveEvent = {
  id: number;
  x: number;
  y: number;
};

export type ProcessPickerOverlayState = {
  active: boolean;
  cursorX: number;
  cursorY: number;
  label: string | null;
};

export type EdgeStopOverlayConfig = {
  enabled: boolean;
  topWidth: string;
  rightWidth: string;
  bottomWidth: string;
  leftWidth: string;
};

export type EdgeStopOverlayState = {
  enabled: boolean;
  zones: OverlayRect[];
};

export type ClickPositionOverlayState = {
  edgeStop: EdgeStopOverlayState;
  editable: boolean;
  height: number;
  originX: number;
  originY: number;
  positions: ClickPosition[];
  processPicker: ProcessPickerOverlayState;
  theme: OverlayVisualTheme;
  visible: boolean;
  width: number;
};

export type ClickPositionOverlayRequest = {
  edgeStop: EdgeStopOverlayConfig;
  editable: boolean;
  positions: ClickPosition[];
  theme: OverlayVisualTheme;
  visible: boolean;
};

const EMPTY_OVERLAY_STATE: ClickPositionOverlayState = {
  edgeStop: {
    enabled: false,
    zones: [],
  },
  editable: false,
  height: 0,
  originX: 0,
  originY: 0,
  positions: [],
  processPicker: {
    active: false,
    cursorX: 0,
    cursorY: 0,
    label: null,
  },
  theme: { ...defaultOverlayVisualTheme },
  visible: false,
  width: 0,
};

export async function syncClickPositionOverlay(
  overlay: ClickPositionOverlayRequest,
) {
  if (!isTauri()) {
    return;
  }

  return trackedInvoke<void>("sync_click_position_overlay", { overlay });
}

export async function getClickPositionOverlayState() {
  if (!isTauri()) {
    return { ...EMPTY_OVERLAY_STATE };
  }

  return trackedInvoke<ClickPositionOverlayState>(
    "get_click_position_overlay_state",
  );
}

export async function getCurrentCursorPosition() {
  if (!isTauri()) {
    return { x: 0, y: 0 } satisfies ScreenPoint;
  }

  return trackedInvoke<ScreenPoint>("get_current_cursor_position");
}

export async function setClickPositionOverlayInteractive(interactive: boolean) {
  if (!isTauri()) {
    return;
  }

  return trackedInvoke<void>("set_click_position_overlay_interactive", {
    interactive,
  });
}

export function emptyClickPositionOverlayState() {
  return {
    ...EMPTY_OVERLAY_STATE,
    processPicker: { ...EMPTY_OVERLAY_STATE.processPicker },
    theme: { ...EMPTY_OVERLAY_STATE.theme },
  };
}
