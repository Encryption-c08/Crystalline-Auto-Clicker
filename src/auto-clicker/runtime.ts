import type {
  AutoClickerSettings,
  ClickEngine,
  ClickMode,
  ClickRateUnit,
  MouseButtonOption,
} from "./settings"

const clickRateUnitWindows: Record<ClickRateUnit, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

export const MIN_CLICK_RATE = 1
export const MAX_CLICK_RATE = 5_000

export type AutoClickerCommandConfig = {
  clickMode: ClickMode
  clickRate: string
  clickRateUnit: ClickRateUnit
  hotkeyCode: string
  hotkeyLabel: string
  intervalMs: number
  mouseButton: MouseButtonOption
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

  return {
    clickMode: settings.clickMode,
    clickRate,
    clickRateUnit: settings.clickRateUnit,
    hotkeyCode: settings.hotkey.code,
    hotkeyLabel: settings.hotkey.label,
    intervalMs: resolveClickIntervalMs(clickRate, settings.clickRateUnit),
    mouseButton: settings.mouseButton,
    clickEngine: "throughput",
  }
}
