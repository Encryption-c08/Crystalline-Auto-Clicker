export type ClickRateUnit = "s" | "m" | "h" | "d"
export type ClickMode = "toggle" | "hold"
export type MouseButtonOption = "left" | "middle" | "right"
export type ClickEngine = "classic" | "throughput"
export type HotkeySource = "keyboard" | "mouse" | "mixed"

export type Hotkey = {
  code: string
  label: string
  source: HotkeySource
}

export type AutoClickerSettings = {
  clickMode: ClickMode
  clickRate: string
  clickRateUnit: ClickRateUnit
  hotkey: Hotkey
  mouseButton: MouseButtonOption
}

export const clickRateUnits: ClickRateUnit[] = ["s", "m", "h", "d"]
export const clickModes: ClickMode[] = ["toggle", "hold"]
export const mouseButtons: MouseButtonOption[] = ["left", "middle", "right"]
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
}

type HotkeyPart = {
  code: string
  isModifier?: boolean
  label: string
  source: Exclude<HotkeySource, "mixed">
}

const keyboardLabels = new Map<string, string>([
  ["Space", "Space"],
  ["Tab", "Tab"],
  ["Enter", "Enter"],
  ["Escape", "Esc"],
  ["Backspace", "Backspace"],
  ["Delete", "Delete"],
  ["Insert", "Insert"],
  ["Home", "Home"],
  ["End", "End"],
  ["PageUp", "PgUp"],
  ["PageDown", "PgDn"],
  ["ArrowUp", "Up"],
  ["ArrowDown", "Down"],
  ["ArrowLeft", "Left"],
  ["ArrowRight", "Right"],
  ["NumpadAdd", "Num +"],
  ["NumpadSubtract", "Num -"],
  ["NumpadMultiply", "Num *"],
  ["NumpadDivide", "Num /"],
  ["NumpadDecimal", "Num ."],
  ["NumpadEnter", "Num Enter"],
])

const modifierHotkeyParts: HotkeyPart[] = [
  { code: "Ctrl", isModifier: true, label: "Ctrl", source: "keyboard" },
  { code: "Shift", isModifier: true, label: "Shift", source: "keyboard" },
  { code: "Alt", isModifier: true, label: "Alt", source: "keyboard" },
]

const mouseHotkeyParts = [
  { button: 0, mask: 1, part: { code: "Mouse1", label: "Mouse 1", source: "mouse" as const } },
  { button: 1, mask: 2, part: { code: "Mouse3", label: "Mouse 3", source: "mouse" as const } },
  { button: 2, mask: 4, part: { code: "Mouse2", label: "Mouse 2", source: "mouse" as const } },
  { button: 3, mask: 8, part: { code: "Mouse4", label: "Mouse 4", source: "mouse" as const } },
  { button: 4, mask: 16, part: { code: "Mouse5", label: "Mouse 5", source: "mouse" as const } },
]

export const defaultAutoClickerSettings: AutoClickerSettings = {
  clickMode: "hold",
  clickRate: "25",
  clickRateUnit: "s",
  hotkey: {
    code: "",
    label: "Unbound",
    source: "keyboard",
  },
  mouseButton: "left",
}

function buildHotkey(parts: HotkeyPart[]): Hotkey | null {
  const uniqueParts: HotkeyPart[] = []
  const seenCodes = new Set<string>()

  for (const part of parts) {
    if (seenCodes.has(part.code)) {
      continue
    }

    seenCodes.add(part.code)
    uniqueParts.push(part)
  }

  if (!uniqueParts.some((part) => !part.isModifier)) {
    return null
  }

  const hasKeyboard = uniqueParts.some((part) => part.source === "keyboard")
  const hasMouse = uniqueParts.some((part) => part.source === "mouse")

  return {
    code: uniqueParts.map((part) => part.code).join("+"),
    label: uniqueParts.map((part) => part.label).join(" + "),
    source: hasKeyboard && hasMouse ? "mixed" : hasMouse ? "mouse" : "keyboard",
  }
}

function modifierPartsFromEvent(event: KeyboardEvent | MouseEvent) {
  if (event.metaKey) {
    return []
  }

  return modifierHotkeyParts.filter((part) => {
    if (part.code === "Ctrl") {
      return event.ctrlKey
    }

    if (part.code === "Shift") {
      return event.shiftKey
    }

    return event.altKey
  })
}

function keyboardHotkeyPartFromEvent(event: KeyboardEvent): HotkeyPart | null {
  if (event.metaKey) {
    return null
  }

  if (
    event.key === "Shift" ||
    event.key === "Control" ||
    event.key === "Alt" ||
    event.key === "Meta"
  ) {
    return null
  }

  if (keyboardLabels.has(event.code)) {
    return {
      code: event.code,
      label: keyboardLabels.get(event.code)!,
      source: "keyboard",
    }
  }

  if (/^Key[A-Z]$/.test(event.code)) {
    return {
      code: event.code,
      label: event.code.slice(3),
      source: "keyboard",
    }
  }

  if (/^Digit[0-9]$/.test(event.code)) {
    return {
      code: event.code,
      label: event.code.slice(5),
      source: "keyboard",
    }
  }

  if (/^Numpad[0-9]$/.test(event.code)) {
    return {
      code: event.code,
      label: `Num ${event.code.slice(6)}`,
      source: "keyboard",
    }
  }

  if (/^F\d{1,2}$/.test(event.key)) {
    return {
      code: event.code,
      label: event.key.toUpperCase(),
      source: "keyboard",
    }
  }

  if (event.key.length === 1) {
    return {
      code: event.code,
      label: event.key.toUpperCase(),
      source: "keyboard",
    }
  }

  return null
}

function mouseHotkeyPartFromButton(button: number) {
  return mouseHotkeyParts.find((entry) => entry.button === button)?.part ?? null
}

function mouseHotkeyPartsFromEvent(event: MouseEvent) {
  const parts: HotkeyPart[] = []
  const primaryPart = mouseHotkeyPartFromButton(event.button)

  if (primaryPart) {
    parts.push(primaryPart)
  }

  for (const entry of mouseHotkeyParts) {
    if ((event.buttons & entry.mask) === 0 || entry.button === event.button) {
      continue
    }

    parts.push(entry.part)
  }

  if (parts.length === 0) {
    const fallbackPart = mouseHotkeyPartFromButton(event.button)
    if (fallbackPart) {
      parts.push(fallbackPart)
    }
  }

  return parts
}

export function formatKeyboardHotkey(event: KeyboardEvent): Hotkey | null {
  const keyPart = keyboardHotkeyPartFromEvent(event)
  if (!keyPart) {
    return null
  }

  return buildHotkey([...modifierPartsFromEvent(event), keyPart])
}

export function formatMouseHotkey(event: MouseEvent): Hotkey | null {
  if (event.metaKey) {
    return null
  }

  return buildHotkey([
    ...modifierPartsFromEvent(event),
    ...mouseHotkeyPartsFromEvent(event),
  ])
}

export function formatLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
