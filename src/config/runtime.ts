import type {
  AutoClickerSettings,
  ClickPosition,
  ClickEngine,
  ClickMode,
  ClickRateMode,
  ClickRateUnit,
  MouseActionOption,
  MouseButtonOption,
} from "./settings"
import { formatHotkeyLabel, normalizeHotkeyCode } from "@/input/hotkeys"

const clickRateUnitWindows: Record<ClickRateUnit, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

export const MIN_CLICK_RATE = 1
export const MAX_CLICK_RATE = 5_000
export const MIN_DOUBLE_CLICK_DELAY = 0
export const MIN_CLICK_DURATION = 1
export const MIN_CLICK_LIMIT = 1
export const MAX_CLICK_LIMIT = 1_000_000
export const MIN_TIME_LIMIT = 1
export const MAX_TIME_LIMIT = 1_000_000

export type AutoClickerCommandConfig = {
  clickMode: ClickMode
  clickRate: string
  clickRateMode: ClickRateMode
  clickRateUnit: ClickRateUnit
  hotkeyCode: string
  hotkeyLabel: string
  intervalMs: number
  mouseButton: MouseButtonOption
  mouseAction: MouseActionOption
  clickPositionEnabled: boolean
  clickPositions: ClickPosition[]
  doubleClickEnabled: boolean
  doubleClickDelay: string
  clickDurationEnabled: boolean
  clickDurationMin: string
  clickDurationMax: string
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

export function normalizeDoubleClickDelayInput(value: string) {
  const digitsOnly = value.replace(/[^0-9]/g, "")

  if (digitsOnly === "") {
    return ""
  }

  const normalizedValue = digitsOnly.replace(/^0+(?=\d)/, "")

  return normalizedValue === "" ? String(MIN_DOUBLE_CLICK_DELAY) : normalizedValue
}

export function finalizeDoubleClickDelay(value: string) {
  return normalizeDoubleClickDelayInput(value) || String(MIN_DOUBLE_CLICK_DELAY)
}

export function normalizeClickDurationInput(value: string) {
  const digitsOnly = value.replace(/[^0-9]/g, "")

  if (digitsOnly === "") {
    return ""
  }

  const normalizedValue = digitsOnly.replace(/^0+/, "")

  return normalizedValue === "" ? String(MIN_CLICK_DURATION) : normalizedValue
}

export function finalizeClickDuration(value: string) {
  return normalizeClickDurationInput(value) || String(MIN_CLICK_DURATION)
}

export function finalizeClickDurationRange(
  minValue: string,
  maxValue: string
) {
  const minDuration = Number.parseInt(finalizeClickDuration(minValue), 10)
  const maxCandidate = Number.parseInt(
    finalizeClickDuration(maxValue || minValue),
    10
  )

  const normalizedMin = Number.isNaN(minDuration)
    ? MIN_CLICK_DURATION
    : Math.max(MIN_CLICK_DURATION, minDuration)
  const normalizedMaxCandidate = Number.isNaN(maxCandidate)
    ? normalizedMin
    : Math.max(MIN_CLICK_DURATION, maxCandidate)

  return {
    min: String(normalizedMin),
    max: String(Math.max(normalizedMin, normalizedMaxCandidate)),
  }
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
  clickRateMode: ClickRateMode,
  clickRate: string,
  clickRateUnit: ClickRateUnit
) {
  const normalizedRate = Number.parseInt(finalizeClickRate(clickRate), 10)
  const unitWindowMs = clickRateUnitWindows[clickRateUnit]

  if (clickRateMode === "every") {
    return Math.max(1, unitWindowMs * normalizedRate)
  }

  return Math.max(1, Math.floor(unitWindowMs / normalizedRate))
}

export function resolveBaseClicksPerSecond(
  clickRateMode: ClickRateMode,
  clickRate: string,
  clickRateUnit: ClickRateUnit
) {
  const intervalMs = resolveClickIntervalMs(
    clickRateMode,
    clickRate,
    clickRateUnit
  )

  return 1_000 / intervalMs
}

export function estimateAverageClicksPerSecond(settings: AutoClickerSettings) {
  if (settings.mouseAction !== "click") {
    return null
  }

  const cycleIntervalMs = resolveClickIntervalMs(
    settings.clickRateMode,
    settings.clickRate,
    settings.clickRateUnit
  )
  const clicksPerCycle = settings.doubleClickEnabled ? 2 : 1
  const interClickDelayMs = settings.doubleClickEnabled
    ? Number.parseInt(finalizeDoubleClickDelay(settings.doubleClickDelay), 10)
    : 0
  const averageClickDurationMs = settings.clickDurationEnabled
    ? (() => {
        const clickDuration = finalizeClickDurationRange(
          settings.clickDurationMin,
          settings.clickDurationMax
        )
        const minDuration = Number.parseInt(clickDuration.min, 10)
        const maxDuration = Number.parseInt(clickDuration.max, 10)
        const averageDurationMs = (minDuration + maxDuration) / 2

        return Number.isFinite(averageDurationMs) && averageDurationMs > 0
          ? averageDurationMs
          : 0
      })()
    : 0
  const cycleExecutionMs =
    averageClickDurationMs * clicksPerCycle +
    interClickDelayMs * Math.max(0, clicksPerCycle - 1)
  const cycleSpacingMs = Math.max(
    cycleIntervalMs,
    cycleExecutionMs > 0 ? cycleExecutionMs : 0
  )

  if (!Number.isFinite(cycleSpacingMs) || cycleSpacingMs <= 0) {
    return 0
  }

  return (clicksPerCycle * 1_000) / cycleSpacingMs
}

export function formatClicksPerSecond(value: number) {
  if (!Number.isFinite(value)) {
    return "0"
  }

  if (value >= 10) {
    return value.toFixed(1).replace(/\.0$/, "")
  }

  if (value >= 1) {
    return value.toFixed(1).replace(/\.0$/, "")
  }

  if (value >= 0.1) {
    return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
  }

  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
}

export function buildAutoClickerConfig(
  settings: AutoClickerSettings
): AutoClickerCommandConfig {
  const clickRate = finalizeClickRate(settings.clickRate)
  const doubleClickDelay = finalizeDoubleClickDelay(settings.doubleClickDelay)
  const clickDuration = finalizeClickDurationRange(
    settings.clickDurationMin,
    settings.clickDurationMax
  )
  const clickLimit = finalizeClickLimit(settings.clickLimit)
  const timeLimit = finalizeTimeLimit(settings.timeLimit)
  const hotkeyCode = normalizeHotkeyCode(settings.hotkey.code)

  return {
    clickMode: settings.clickMode,
    clickRate,
    clickRateMode: settings.clickRateMode,
    clickRateUnit: settings.clickRateUnit,
    hotkeyCode,
    hotkeyLabel: formatHotkeyLabel(hotkeyCode),
    intervalMs: resolveClickIntervalMs(
      settings.clickRateMode,
      clickRate,
      settings.clickRateUnit
    ),
    mouseButton: settings.mouseButton,
    mouseAction: settings.mouseAction,
    clickPositionEnabled: settings.clickPositionEnabled,
    clickPositions: settings.clickPositions,
    doubleClickEnabled: settings.doubleClickEnabled,
    doubleClickDelay,
    clickDurationEnabled: settings.clickDurationEnabled,
    clickDurationMin: clickDuration.min,
    clickDurationMax: clickDuration.max,
    clickLimitEnabled: settings.clickLimitEnabled,
    clickLimit,
    timeLimitEnabled: settings.timeLimitEnabled,
    timeLimit,
    timeLimitUnit: settings.timeLimitUnit,
    clickEngine: "throughput",
  }
}
