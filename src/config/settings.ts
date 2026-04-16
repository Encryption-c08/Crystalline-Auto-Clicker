import { normalizeHotkey, UNBOUND_HOTKEY, type Hotkey } from "@/input/hotkeys"

export type ClickRateMode = "per" | "every"
export type ClickRateUnit = "ms" | "s" | "m" | "h" | "d"
export type ClickMode = "toggle" | "hold"
export type MouseButtonOption = "left" | "middle" | "right" | "mouse4" | "mouse5"
export type MouseActionOption = "click" | "hold"
export type ClickEngine = "classic" | "throughput"

export type AutoClickerSettings = {
  clickMode: ClickMode
  clickRate: string
  clickRateMode: ClickRateMode
  clickRateUnit: ClickRateUnit
  hotkey: Hotkey
  mouseButton: MouseButtonOption
  mouseAction: MouseActionOption
  clickDurationEnabled: boolean
  clickDurationMin: string
  clickDurationMax: string
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
  clickRateMode?: string | null
  clickRateUnit?: string | null
  hotkey?: SavedHotkey | null
  mouseButton?: string | null
  mouseAction?: string | null
  clickDurationEnabled?: boolean | null
  clickDurationMin?: string | null
  clickDurationMax?: string | null
  clickDuration?: string | null
  clickLimitEnabled?: boolean | null
  clickLimit?: string | null
  timeLimitEnabled?: boolean | null
  timeLimit?: string | null
  timeLimitUnit?: string | null
}

export const clickRateModes: ClickRateMode[] = ["per", "every"]
export const clickRateEveryUnits: ClickRateUnit[] = ["ms", "s", "m", "h", "d"]
export const clickRatePerUnits: ClickRateUnit[] = ["s", "m", "h", "d"]
export const timeLimitUnits: ClickRateUnit[] = ["s", "m", "h", "d"]
export const clickModes: ClickMode[] = ["toggle", "hold"]
export const mouseButtons: MouseButtonOption[] = [
  "left",
  "middle",
  "right",
  "mouse4",
  "mouse5",
]
export const mouseActions: MouseActionOption[] = ["click", "hold"]
export const clickRateModeLabels: Record<ClickRateMode, string> = {
  per: "Per",
  every: "Every",
}
export const clickRateUnitLabels: Record<ClickRateUnit, string> = {
  ms: "Milliseconds",
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
  clickRateMode: "per",
  clickRateUnit: "s",
  hotkey: { ...UNBOUND_HOTKEY },
  mouseButton: "left",
  mouseAction: "click",
  clickDurationEnabled: false,
  clickDurationMin: "1",
  clickDurationMax: "1",
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

export function getClickRateUnitsForMode(mode: ClickRateMode) {
  return mode === "every" ? clickRateEveryUnits : clickRatePerUnits
}

export function normalizeAutoClickerSettings(
  settings: SavedAutoClickerSettings | null | undefined
): AutoClickerSettings {
  const hotkey = settings?.hotkey
  const clickRateMode = resolveOption(
    settings?.clickRateMode,
    clickRateModes,
    defaultAutoClickerSettings.clickRateMode
  )
  const hasLegacyClickDuration =
    typeof settings?.clickDuration === "string" && settings.clickDuration !== ""
  const resolvedLegacyClickDuration = hasLegacyClickDuration
    ? settings?.clickDuration
    : undefined
  const resolvedClickDurationMin =
    typeof settings?.clickDurationMin === "string"
      ? settings.clickDurationMin
      : resolvedLegacyClickDuration ?? defaultAutoClickerSettings.clickDurationMin
  const resolvedClickDurationMax =
    typeof settings?.clickDurationMax === "string"
      ? settings.clickDurationMax
      : typeof settings?.clickDurationMin === "string"
        ? settings.clickDurationMin
        : resolvedLegacyClickDuration ?? defaultAutoClickerSettings.clickDurationMax

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
    clickRateMode,
    clickRateUnit: resolveOption(
      settings?.clickRateUnit,
      getClickRateUnitsForMode(clickRateMode),
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
    clickDurationEnabled:
      typeof settings?.clickDurationEnabled === "boolean"
        ? settings.clickDurationEnabled
        : typeof settings?.clickDurationMin === "string" ||
            typeof settings?.clickDurationMax === "string" ||
            hasLegacyClickDuration
          ? true
          : defaultAutoClickerSettings.clickDurationEnabled,
    clickDurationMin: resolvedClickDurationMin,
    clickDurationMax: resolvedClickDurationMax,
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
      timeLimitUnits,
      defaultAutoClickerSettings.timeLimitUnit
    ),
  }
}
