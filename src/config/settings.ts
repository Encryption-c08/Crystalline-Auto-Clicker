import { UNBOUND_HOTKEY, type Hotkey } from "@/input/hotkeys"

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
}
