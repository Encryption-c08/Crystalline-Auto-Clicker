export type HotkeySource = "keyboard" | "mouse" | "mixed"

export type Hotkey = {
  code: string
  label: string
  source: HotkeySource
}

type HotkeyPart = {
  code: string
  isModifier?: boolean
  label: string
  source: Exclude<HotkeySource, "mixed">
}

type WheelHotkeyDirection = "up" | "down"

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
  // DOM MouseEvent.buttons uses left=1, right=2, middle=4.
  { button: 1, mask: 4, part: { code: "Mouse3", label: "Mouse 3", source: "mouse" as const } },
  { button: 2, mask: 2, part: { code: "Mouse2", label: "Mouse 2", source: "mouse" as const } },
  { button: 3, mask: 8, part: { code: "Mouse4", label: "Mouse 4", source: "mouse" as const } },
  { button: 4, mask: 16, part: { code: "Mouse5", label: "Mouse 5", source: "mouse" as const } },
]

const wheelHotkeyParts: Record<WheelHotkeyDirection, HotkeyPart> = {
  down: { code: "WheelDown", label: "Wheel Down", source: "mouse" },
  up: { code: "WheelUp", label: "Wheel Up", source: "mouse" },
}

export const UNBOUND_HOTKEY: Hotkey = {
  code: "",
  label: "Unbound",
  source: "keyboard",
}

const modifierHotkeyCodes = new Set(
  modifierHotkeyParts.map((part) => part.code)
)

function normalizeHotkeyParts(parts: HotkeyPart[]) {
  const uniqueParts: HotkeyPart[] = []
  const seenCodes = new Set<string>()

  for (const part of parts) {
    if (seenCodes.has(part.code)) {
      continue
    }

    seenCodes.add(part.code)
    uniqueParts.push(part)
  }

  const orderedParts = [
    ...modifierHotkeyParts
      .map((modifier) =>
        uniqueParts.find((part) => part.code === modifier.code) ?? null
      )
      .filter((part): part is HotkeyPart => part !== null),
    ...uniqueParts.filter((part) => !part.isModifier),
  ]

  return orderedParts
}

function resolveHotkeySource(parts: HotkeyPart[]): HotkeySource {
  const hasKeyboard = parts.some((part) => part.source === "keyboard")
  const hasMouse = parts.some((part) => part.source === "mouse")

  return hasKeyboard && hasMouse ? "mixed" : hasMouse ? "mouse" : "keyboard"
}

export function createHotkey(parts: HotkeyPart[]): Hotkey | null {
  const normalizedParts = normalizeHotkeyParts(parts)

  if (!normalizedParts.some((part) => !part.isModifier)) {
    return null
  }

  return {
    code: normalizedParts.map((part) => part.code).join("+"),
    label: normalizedParts.map((part) => part.label).join(" + "),
    source: resolveHotkeySource(normalizedParts),
  }
}

function modifierPartsFromEvent(event: KeyboardEvent | MouseEvent | WheelEvent) {
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

export function hotkeyCaptureCodeFromMouseButton(button: number) {
  return mouseHotkeyPartFromButton(button)?.code ?? null
}

function mouseHotkeyPartsFromButtons(buttons: number) {
  const parts: HotkeyPart[] = []

  for (const entry of mouseHotkeyParts) {
    if ((buttons & entry.mask) !== 0) {
      parts.push(entry.part)
    }
  }

  return parts
}

function mouseHotkeyPartsFromButtonSequence(buttons: number[]) {
  const parts: HotkeyPart[] = []
  const seenButtons = new Set<number>()

  for (const button of buttons) {
    if (seenButtons.has(button)) {
      continue
    }

    seenButtons.add(button)

    const part = mouseHotkeyPartFromButton(button)
    if (part) {
      parts.push(part)
    }
  }

  return parts
}

function mouseHotkeyPartsFromEvent(event: MouseEvent) {
  const primaryPart = mouseHotkeyPartFromButton(event.button)
  const parts = mouseHotkeyPartsFromButtons(event.buttons).filter(
    (part) => part.code !== primaryPart?.code
  )

  if (primaryPart) {
    parts.push(primaryPart)
  }

  if (parts.length === 0) {
    const fallbackPart = mouseHotkeyPartFromButton(event.button)
    if (fallbackPart) {
      parts.push(fallbackPart)
    }
  }

  return parts
}

function wheelHotkeyPartFromEvent(event: WheelEvent): HotkeyPart | null {
  if (event.deltaY === 0) {
    return null
  }

  return event.deltaY < 0 ? wheelHotkeyParts.up : wheelHotkeyParts.down
}

function hotkeyPartFromCode(code: string): HotkeyPart | null {
  const trimmedCode = code.trim()

  const modifierPart = modifierHotkeyParts.find((part) => part.code === trimmedCode)
  if (modifierPart) {
    return modifierPart
  }

  if (keyboardLabels.has(trimmedCode)) {
    return {
      code: trimmedCode,
      label: keyboardLabels.get(trimmedCode)!,
      source: "keyboard",
    }
  }

  const mousePart = mouseHotkeyParts.find((entry) => entry.part.code === trimmedCode)?.part
  if (mousePart) {
    return mousePart
  }

  const wheelPart = Object.values(wheelHotkeyParts).find(
    (part) => part.code === trimmedCode
  )
  if (wheelPart) {
    return wheelPart
  }

  if (/^Key[A-Z]$/i.test(trimmedCode)) {
    return {
      code: `Key${trimmedCode.slice(3).toUpperCase()}`,
      label: trimmedCode.slice(3).toUpperCase(),
      source: "keyboard",
    }
  }

  if (/^Digit[0-9]$/.test(trimmedCode)) {
    return {
      code: trimmedCode,
      label: trimmedCode.slice(5),
      source: "keyboard",
    }
  }

  if (/^Numpad[0-9]$/.test(trimmedCode)) {
    return {
      code: trimmedCode,
      label: `Num ${trimmedCode.slice(6)}`,
      source: "keyboard",
    }
  }

  if (/^F\d{1,2}$/i.test(trimmedCode)) {
    return {
      code: trimmedCode.toUpperCase(),
      label: trimmedCode.toUpperCase(),
      source: "keyboard",
    }
  }

  return null
}

export function hotkeyCaptureCodeFromKeyboardEvent(event: KeyboardEvent) {
  if (event.key === "Control") {
    return "Ctrl"
  }

  if (event.key === "Shift") {
    return "Shift"
  }

  if (event.key === "Alt") {
    return "Alt"
  }

  if (event.key === "Meta") {
    return null
  }

  return keyboardHotkeyPartFromEvent(event)?.code ?? null
}

export function isModifierHotkeyCode(code: string) {
  return modifierHotkeyCodes.has(code)
}

export function buildHotkeyFromCaptureCodes(codes: string[]): Hotkey | null {
  const parts = codes
    .map((code) => hotkeyPartFromCode(code))
    .filter((part): part is HotkeyPart => part !== null)

  return createHotkey(parts)
}

export function buildHotkeyFromPressedInputs({
  keyboardCodes = [],
  mouseButtons = [],
  wheelDirection,
}: {
  keyboardCodes?: string[]
  mouseButtons?: number[]
  wheelDirection?: WheelHotkeyDirection
}): Hotkey | null {
  const keyboardParts = keyboardCodes
    .map((code) => hotkeyPartFromCode(code))
    .filter((part): part is HotkeyPart => part !== null)
  const mouseParts = mouseHotkeyPartsFromButtonSequence(mouseButtons)
  const wheelPart =
    wheelDirection !== undefined ? wheelHotkeyParts[wheelDirection] : null

  return createHotkey([
    ...keyboardParts,
    ...mouseParts,
    ...(wheelPart ? [wheelPart] : []),
  ])
}

export function parseHotkeyCode(code: string): Hotkey | null {
  const parts = code
    .split("+")
    .map((part) => hotkeyPartFromCode(part))
    .filter((part): part is HotkeyPart => part !== null)

  if (parts.length === 0) {
    return null
  }

  return createHotkey(parts)
}

export function normalizeHotkeyCode(code: string) {
  return parseHotkeyCode(code)?.code ?? ""
}

export function formatHotkeyLabel(code: string) {
  return parseHotkeyCode(code)?.label ?? UNBOUND_HOTKEY.label
}

export function normalizeHotkey(hotkey: Hotkey | null | undefined) {
  if (!hotkey || hotkey.code.trim() === "") {
    return { ...UNBOUND_HOTKEY }
  }

  return parseHotkeyCode(hotkey.code) ?? { ...UNBOUND_HOTKEY }
}

export function formatKeyboardHotkey(event: KeyboardEvent): Hotkey | null {
  const keyPart = keyboardHotkeyPartFromEvent(event)
  if (!keyPart) {
    return null
  }

  return createHotkey([...modifierPartsFromEvent(event), keyPart])
}

export function formatMouseHotkey(event: MouseEvent): Hotkey | null {
  if (event.metaKey) {
    return null
  }

  return createHotkey([
    ...modifierPartsFromEvent(event),
    ...mouseHotkeyPartsFromEvent(event),
  ])
}

export function formatWheelHotkey(
  event: WheelEvent,
  heldMouseButtons: number[] = []
): Hotkey | null {
  if (event.metaKey) {
    return null
  }

  const wheelPart = wheelHotkeyPartFromEvent(event)
  if (!wheelPart) {
    return null
  }

  return createHotkey([
    ...modifierPartsFromEvent(event),
    ...(heldMouseButtons.length > 0
      ? mouseHotkeyPartsFromButtonSequence(heldMouseButtons)
      : mouseHotkeyPartsFromButtons(event.buttons)),
    wheelPart,
  ])
}
