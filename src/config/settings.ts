import { normalizeHotkey, UNBOUND_HOTKEY, type Hotkey } from "@/input/hotkeys"

export type ClickRateUnit = "s" | "m" | "h" | "d"
export type ClickMode = "toggle" | "hold"
export type MouseButtonOption = "left" | "middle" | "right" | "mouse4" | "mouse5"
export type MouseActionOption = "click" | "hold"
export type ClickEngine = "classic" | "throughput"

export type AutoClickerSettings = {
  clickMode: ClickMode
  clickRate: string
  clickRateUnit: ClickRateUnit
  hotkey: Hotkey
  mouseButton: MouseButtonOption
  mouseAction: MouseActionOption
  clickLimitEnabled: boolean
  clickLimit: string
  timeLimitEnabled: boolean
  timeLimit: string
  timeLimitUnit: ClickRateUnit
}

export type SavedHotkey = {
  code?: string | null
  label?: string | null
  source?: string | null
}

export type SavedAutoClickerSettings = {
  clickMode?: string | null
  clickRate?: string | null
  clickRateUnit?: string | null
  hotkey?: SavedHotkey | null
  mouseButton?: string | null
  mouseAction?: string | null
  clickLimitEnabled?: boolean | null
  clickLimit?: string | null
  timeLimitEnabled?: boolean | null
  timeLimit?: string | null
  timeLimitUnit?: string | null
}

export const clickRateUnits: ClickRateUnit[] = ["s", "m", "h", "d"]
export const clickModes: ClickMode[] = ["toggle", "hold"]
export const mouseButtons: MouseButtonOption[] = [
  "left",
  "middle",
  "right",
  "mouse4",
  "mouse5",
]
export const mouseActions: MouseActionOption[] = ["click", "hold"]
export const clickRateUnitLabels: Record<ClickRateUnit, string> = {
  s: "Seconds",
  m: "Minutes",
  h: "Hours",
  d: "Days",
}
export const mouseButtonLabels: Record<MouseButtonOption, string> = {
  left: "Left",
  middle: "Middle",
  right: "Right",
  mouse4: "Mouse 4",
  mouse5: "Mouse 5",
}
export const mouseActionLabels: Record<MouseActionOption, string> = {
  click: "Click",
  hold: "Hold",
}

export const defaultAutoClickerSettings: AutoClickerSettings = {
  clickMode: "hold",
  clickRate: "25",
  clickRateUnit: "s",
  hotkey: { ...UNBOUND_HOTKEY },
  mouseButton: "left",
  mouseAction: "click",
  clickLimitEnabled: false,
  clickLimit: "100",
  timeLimitEnabled: false,
  timeLimit: "60",
  timeLimitUnit: "s",
}

function resolveOption<T extends string>(
  value: string | null | undefined,
  options: readonly T[],
  fallback: T
) {
  if (typeof value !== "string") {
    return fallback
  }

  return (options as readonly string[]).includes(value) ? (value as T) : fallback
}

function normalizeHotkeySource(value: string | null | undefined): Hotkey["source"] {
  if (value === "mouse" || value === "mixed") {
    return value
  }

  return "keyboard"
}

export function normalizeAutoClickerSettings(
  settings: SavedAutoClickerSettings | null | undefined
): AutoClickerSettings {
  const hotkey = settings?.hotkey

  return {
    clickMode: resolveOption(
      settings?.clickMode,
      clickModes,
      defaultAutoClickerSettings.clickMode
    ),
    clickRate:
      typeof settings?.clickRate === "string"
        ? settings.clickRate
        : defaultAutoClickerSettings.clickRate,
    clickRateUnit: resolveOption(
      settings?.clickRateUnit,
      clickRateUnits,
      defaultAutoClickerSettings.clickRateUnit
    ),
    hotkey: normalizeHotkey(
      hotkey
        ? {
            code: typeof hotkey.code === "string" ? hotkey.code : "",
            label:
              typeof hotkey.label === "string"
                ? hotkey.label
                : defaultAutoClickerSettings.hotkey.label,
            source: normalizeHotkeySource(hotkey.source),
          }
        : defaultAutoClickerSettings.hotkey
    ),
    mouseButton: resolveOption(
      settings?.mouseButton,
      mouseButtons,
      defaultAutoClickerSettings.mouseButton
    ),
    mouseAction: resolveOption(
      settings?.mouseAction,
      mouseActions,
      defaultAutoClickerSettings.mouseAction
    ),
    clickLimitEnabled:
      typeof settings?.clickLimitEnabled === "boolean"
        ? settings.clickLimitEnabled
        : defaultAutoClickerSettings.clickLimitEnabled,
    clickLimit:
      typeof settings?.clickLimit === "string"
        ? settings.clickLimit
        : defaultAutoClickerSettings.clickLimit,
    timeLimitEnabled:
      typeof settings?.timeLimitEnabled === "boolean"
        ? settings.timeLimitEnabled
        : defaultAutoClickerSettings.timeLimitEnabled,
    timeLimit:
      typeof settings?.timeLimit === "string"
        ? settings.timeLimit
        : defaultAutoClickerSettings.timeLimit,
    timeLimitUnit: resolveOption(
      settings?.timeLimitUnit,
      clickRateUnits,
      defaultAutoClickerSettings.timeLimitUnit
    ),
  }
}
