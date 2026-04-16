import type {
  AutoClickerSettings,
  ClickEngine,
  ClickMode,
  ClickRateUnit,
  MouseActionOption,
  MouseButtonOption,
} from "./settings"
import { formatHotkeyLabel, normalizeHotkeyCode } from "@/input/hotkeys"

const clickRateUnitWindows: Record<ClickRateUnit, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

export const MIN_CLICK_RATE = 1
export const MAX_CLICK_RATE = 5_000
export const MIN_CLICK_LIMIT = 1
export const MAX_CLICK_LIMIT = 1_000_000
export const MIN_TIME_LIMIT = 1
export const MAX_TIME_LIMIT = 1_000_000

export type AutoClickerCommandConfig = {
  clickMode: ClickMode
  clickRate: string
  clickRateUnit: ClickRateUnit
  hotkeyCode: string
  hotkeyLabel: string
  intervalMs: number
  mouseButton: MouseButtonOption
  mouseAction: MouseActionOption
  clickLimitEnabled: boolean
  clickLimit: string
  timeLimitEnabled: boolean
  timeLimit: string
  timeLimitUnit: ClickRateUnit
  clickEngine: ClickEngine
}

export type AutoClickerStatus = {
  clickMode: ClickMode
  clickerActive: boolean
  hotkeyLabel: string
  hotkeyPressed: boolean
  intervalMs: number
  lastError: string | null
  workerRunning: boolean
}

export function normalizeClickRateInput(value: string) {
  const digitsOnly = value.replace(/[^0-9]/g, "")

  if (digitsOnly === "") {
    return ""
  }

  const nextValue = Number.parseInt(digitsOnly, 10)
  if (Number.isNaN(nextValue)) {
    return String(MIN_CLICK_RATE)
  }

  return String(Math.min(MAX_CLICK_RATE, Math.max(MIN_CLICK_RATE, nextValue)))
}

export function finalizeClickRate(value: string) {
  return normalizeClickRateInput(value) || String(MIN_CLICK_RATE)
}

export function normalizeClickLimitInput(value: string) {
  const digitsOnly = value.replace(/[^0-9]/g, "")

  if (digitsOnly === "") {
    return ""
  }

  const nextValue = Number.parseInt(digitsOnly, 10)
  if (Number.isNaN(nextValue)) {
    return String(MIN_CLICK_LIMIT)
  }

  return String(Math.min(MAX_CLICK_LIMIT, Math.max(MIN_CLICK_LIMIT, nextValue)))
}

export function finalizeClickLimit(value: string) {
  return normalizeClickLimitInput(value) || "100"
}

export function normalizeTimeLimitInput(value: string) {
  const digitsOnly = value.replace(/[^0-9]/g, "")

  if (digitsOnly === "") {
    return ""
  }

  const nextValue = Number.parseInt(digitsOnly, 10)
  if (Number.isNaN(nextValue)) {
    return String(MIN_TIME_LIMIT)
  }

  return String(Math.min(MAX_TIME_LIMIT, Math.max(MIN_TIME_LIMIT, nextValue)))
}

export function finalizeTimeLimit(value: string) {
  return normalizeTimeLimitInput(value) || "60"
}

export function resolveClickIntervalMs(
  clickRate: string,
  clickRateUnit: ClickRateUnit
) {
  const normalizedRate = Number.parseInt(finalizeClickRate(clickRate), 10)
  const totalWindowMs = clickRateUnitWindows[clickRateUnit]

  return Math.max(1, Math.floor(totalWindowMs / normalizedRate))
}

export function buildAutoClickerConfig(
  settings: AutoClickerSettings
): AutoClickerCommandConfig {
  const clickRate = finalizeClickRate(settings.clickRate)
  const clickLimit = finalizeClickLimit(settings.clickLimit)
  const timeLimit = finalizeTimeLimit(settings.timeLimit)
  const hotkeyCode = normalizeHotkeyCode(settings.hotkey.code)

  return {
    clickMode: settings.clickMode,
    clickRate,
    clickRateUnit: settings.clickRateUnit,
    hotkeyCode,
    hotkeyLabel: formatHotkeyLabel(hotkeyCode),
    intervalMs: resolveClickIntervalMs(clickRate, settings.clickRateUnit),
    mouseButton: settings.mouseButton,
    mouseAction: settings.mouseAction,
    clickLimitEnabled: settings.clickLimitEnabled,
    clickLimit,
    timeLimitEnabled: settings.timeLimitEnabled,
    timeLimit,
    timeLimitUnit: settings.timeLimitUnit,
    clickEngine: "throughput",
  }
}
