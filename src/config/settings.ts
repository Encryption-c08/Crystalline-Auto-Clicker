import { normalizeHotkey, UNBOUND_HOTKEY, type Hotkey } from "@/input/hotkeys";

export type ClickRateMode = "per" | "every";
export type ClickRateUnit = "ms" | "s" | "m" | "h" | "d";
export type ClickMode = "toggle" | "hold";
export type MouseButtonOption =
  | "left"
  | "middle"
  | "right"
  | "mouse4"
  | "mouse5";
export type MouseActionOption = "click" | "hold";
export type JitterMode = "random" | "fixed";
export type ClickEngine = "classic" | "throughput";
export type AppTheme = "dark" | "light";
export type ClickPosition = {
  id: number;
  x: number;
  y: number;
};

export type AutoClickerSettings = {
  theme: AppTheme;
  closeToTray: boolean;
  processWhitelistEnabled: boolean;
  processWhitelist: string[];
  processBlacklistEnabled: boolean;
  processBlacklist: string[];
  clickMode: ClickMode;
  clickRate: string;
  clickRateMode: ClickRateMode;
  clickRateUnit: ClickRateUnit;
  hotkey: Hotkey;
  mouseButton: MouseButtonOption;
  mouseAction: MouseActionOption;
  clickPositionEnabled: boolean;
  clickPositionDotsVisible: boolean;
  clickPositionHotkey: Hotkey;
  clickPositions: ClickPosition[];
  jitterEnabled: boolean;
  jitterMode: JitterMode;
  jitterX: string;
  jitterY: string;
  doubleClickEnabled: boolean;
  doubleClickDelay: string;
  clickDurationEnabled: boolean;
  clickDurationMin: string;
  clickDurationMax: string;
  clickLimitEnabled: boolean;
  clickLimit: string;
  timeLimitEnabled: boolean;
  timeLimit: string;
  timeLimitUnit: ClickRateUnit;
};

export type SavedHotkey = {
  code?: string | null;
  label?: string | null;
  source?: string | null;
};

export type SavedClickPosition = {
  id?: number | null;
  x?: number | null;
  y?: number | null;
};

export type SavedAutoClickerSettings = {
  theme?: string | null;
  closeToTray?: boolean | null;
  processWhitelistEnabled?: boolean | null;
  processWhitelist?: string[] | null;
  processBlacklistEnabled?: boolean | null;
  processBlacklist?: string[] | null;
  clickMode?: string | null;
  clickRate?: string | null;
  clickRateMode?: string | null;
  clickRateUnit?: string | null;
  hotkey?: SavedHotkey | null;
  mouseButton?: string | null;
  mouseAction?: string | null;
  clickPositionEnabled?: boolean | null;
  clickPositionDotsVisible?: boolean | null;
  clickPositionHotkey?: SavedHotkey | null;
  clickPositions?: SavedClickPosition[] | null;
  jitterEnabled?: boolean | null;
  jitterMode?: string | null;
  jitterX?: string | null;
  jitterY?: string | null;
  doubleClickEnabled?: boolean | null;
  doubleClickDelay?: string | null;
  clickDurationEnabled?: boolean | null;
  clickDurationMin?: string | null;
  clickDurationMax?: string | null;
  clickDuration?: string | null;
  clickLimitEnabled?: boolean | null;
  clickLimit?: string | null;
  timeLimitEnabled?: boolean | null;
  timeLimit?: string | null;
  timeLimitUnit?: string | null;
};

export const clickRateModes: ClickRateMode[] = ["per", "every"];
export const clickRateEveryUnits: ClickRateUnit[] = ["ms", "s", "m", "h", "d"];
export const clickRatePerUnits: ClickRateUnit[] = ["s", "m", "h", "d"];
export const timeLimitUnits: ClickRateUnit[] = ["s", "m", "h", "d"];
export const clickModes: ClickMode[] = ["toggle", "hold"];
export const appThemes: AppTheme[] = ["dark", "light"];
export const mouseButtons: MouseButtonOption[] = [
  "left",
  "middle",
  "right",
  "mouse4",
  "mouse5",
];
export const mouseActions: MouseActionOption[] = ["click", "hold"];
export const jitterModes: JitterMode[] = ["random", "fixed"];
export const clickRateModeLabels: Record<ClickRateMode, string> = {
  per: "Per",
  every: "Every",
};
export const appThemeLabels: Record<AppTheme, string> = {
  dark: "Dark",
  light: "Light",
};
export const clickRateUnitLabels: Record<ClickRateUnit, string> = {
  ms: "Milliseconds",
  s: "Seconds",
  m: "Minutes",
  h: "Hours",
  d: "Days",
};
export const mouseButtonLabels: Record<MouseButtonOption, string> = {
  left: "Left",
  middle: "Middle",
  right: "Right",
  mouse4: "Mouse 4",
  mouse5: "Mouse 5",
};
export const mouseActionLabels: Record<MouseActionOption, string> = {
  click: "Click",
  hold: "Hold",
};
export const jitterModeLabels: Record<JitterMode, string> = {
  random: "Random",
  fixed: "Fixed",
};

export const defaultAutoClickerSettings: AutoClickerSettings = {
  theme: "dark",
  closeToTray: false,
  processWhitelistEnabled: true,
  processWhitelist: [],
  processBlacklistEnabled: true,
  processBlacklist: [],
  clickMode: "hold",
  clickRate: "25",
  clickRateMode: "per",
  clickRateUnit: "s",
  hotkey: { ...UNBOUND_HOTKEY },
  mouseButton: "left",
  mouseAction: "click",
  clickPositionEnabled: false,
  clickPositionDotsVisible: true,
  clickPositionHotkey: { ...UNBOUND_HOTKEY },
  clickPositions: [],
  jitterEnabled: false,
  jitterMode: "random",
  jitterX: "0",
  jitterY: "0",
  doubleClickEnabled: false,
  doubleClickDelay: "0",
  clickDurationEnabled: false,
  clickDurationMin: "1",
  clickDurationMax: "1",
  clickLimitEnabled: false,
  clickLimit: "100",
  timeLimitEnabled: false,
  timeLimit: "60",
  timeLimitUnit: "s",
};

function resolveOption<T extends string>(
  value: string | null | undefined,
  options: readonly T[],
  fallback: T,
) {
  if (typeof value !== "string") {
    return fallback;
  }

  return (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function normalizeHotkeySource(
  value: string | null | undefined,
): Hotkey["source"] {
  if (value === "mouse" || value === "mixed") {
    return value;
  }

  return "keyboard";
}

function normalizeClickPositions(
  positions: SavedClickPosition[] | null | undefined,
): ClickPosition[] {
  if (!Array.isArray(positions)) {
    return [];
  }

  const normalizedPositions: ClickPosition[] = [];
  const usedIds = new Set<number>();

  for (const [index, position] of positions.entries()) {
    const x = Number.isFinite(position?.x)
      ? Math.round(position!.x as number)
      : null;
    const y = Number.isFinite(position?.y)
      ? Math.round(position!.y as number)
      : null;
    if (x === null || y === null) {
      continue;
    }

    const preferredId =
      typeof position?.id === "number" && Number.isFinite(position.id)
        ? Math.max(1, Math.round(position.id))
        : index + 1;
    let nextId = preferredId;
    while (usedIds.has(nextId)) {
      nextId += 1;
    }

    usedIds.add(nextId);
    normalizedPositions.push({
      id: nextId,
      x,
      y,
    });
  }

  return normalizedPositions;
}

export function normalizeProcessRuleName(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  if (trimmedValue === "") {
    return null;
  }

  const basename = trimmedValue.replace(/^.*[\\/]/, "").toLowerCase();
  if (basename === "") {
    return null;
  }

  return basename.includes(".") ? basename : `${basename}.exe`;
}

export function normalizeProcessRuleList(
  values: string[] | null | undefined,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalizedRules: string[] = [];
  const seenRules = new Set<string>();

  for (const value of values) {
    const normalizedValue = normalizeProcessRuleName(value);
    if (!normalizedValue || seenRules.has(normalizedValue)) {
      continue;
    }

    seenRules.add(normalizedValue);
    normalizedRules.push(normalizedValue);
  }

  return normalizedRules;
}

export function isProcessAllowedByRules(
  processName: string | null | undefined,
  whitelist: readonly string[],
  blacklist: readonly string[],
) {
  const normalizedProcessName = normalizeProcessRuleName(processName);

  if (whitelist.length > 0) {
    return (
      normalizedProcessName !== null &&
      whitelist.includes(normalizedProcessName)
    );
  }

  if (normalizedProcessName === null) {
    return true;
  }

  return !blacklist.includes(normalizedProcessName);
}

export function resolveEnabledProcessRules(
  options: Pick<
    AutoClickerSettings,
    | "processWhitelist"
    | "processWhitelistEnabled"
    | "processBlacklist"
    | "processBlacklistEnabled"
  >,
) {
  const whitelist = options.processWhitelistEnabled
    ? normalizeProcessRuleList(options.processWhitelist)
    : [];
  const blacklist = (
    options.processBlacklistEnabled
      ? normalizeProcessRuleList(options.processBlacklist)
      : []
  ).filter((processName) => !whitelist.includes(processName));

  return { blacklist, whitelist };
}

export function getClickRateUnitsForMode(mode: ClickRateMode) {
  return mode === "every" ? clickRateEveryUnits : clickRatePerUnits;
}

export function normalizeAutoClickerSettings(
  settings: SavedAutoClickerSettings | null | undefined,
): AutoClickerSettings {
  const hotkey = settings?.hotkey;
  const clickRateMode = resolveOption(
    settings?.clickRateMode,
    clickRateModes,
    defaultAutoClickerSettings.clickRateMode,
  );
  const hasLegacyClickDuration =
    typeof settings?.clickDuration === "string" &&
    settings.clickDuration !== "";
  const resolvedLegacyClickDuration = hasLegacyClickDuration
    ? settings?.clickDuration
    : undefined;
  const resolvedClickDurationMin =
    typeof settings?.clickDurationMin === "string"
      ? settings.clickDurationMin
      : (resolvedLegacyClickDuration ??
        defaultAutoClickerSettings.clickDurationMin);
  const resolvedClickDurationMax =
    typeof settings?.clickDurationMax === "string"
      ? settings.clickDurationMax
      : typeof settings?.clickDurationMin === "string"
        ? settings.clickDurationMin
        : (resolvedLegacyClickDuration ??
          defaultAutoClickerSettings.clickDurationMax);
  const clickPositionHotkey = settings?.clickPositionHotkey;
  const normalizedClickPositions = normalizeClickPositions(
    settings?.clickPositions,
  );
  const processWhitelistEnabled =
    typeof settings?.processWhitelistEnabled === "boolean"
      ? settings.processWhitelistEnabled
      : defaultAutoClickerSettings.processWhitelistEnabled;
  const processBlacklistEnabled =
    typeof settings?.processBlacklistEnabled === "boolean"
      ? settings.processBlacklistEnabled
      : defaultAutoClickerSettings.processBlacklistEnabled;
  const processWhitelist = normalizeProcessRuleList(settings?.processWhitelist);
  const processBlacklist = normalizeProcessRuleList(settings?.processBlacklist);

  return {
    theme: resolveOption(
      settings?.theme,
      appThemes,
      defaultAutoClickerSettings.theme,
    ),
    closeToTray:
      typeof settings?.closeToTray === "boolean"
        ? settings.closeToTray
        : defaultAutoClickerSettings.closeToTray,
    processWhitelistEnabled,
    processWhitelist,
    processBlacklistEnabled,
    processBlacklist,
    clickMode: resolveOption(
      settings?.clickMode,
      clickModes,
      defaultAutoClickerSettings.clickMode,
    ),
    clickRate:
      typeof settings?.clickRate === "string"
        ? settings.clickRate
        : defaultAutoClickerSettings.clickRate,
    clickRateMode,
    clickRateUnit: resolveOption(
      settings?.clickRateUnit,
      getClickRateUnitsForMode(clickRateMode),
      defaultAutoClickerSettings.clickRateUnit,
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
        : defaultAutoClickerSettings.hotkey,
    ),
    mouseButton: resolveOption(
      settings?.mouseButton,
      mouseButtons,
      defaultAutoClickerSettings.mouseButton,
    ),
    mouseAction: resolveOption(
      settings?.mouseAction,
      mouseActions,
      defaultAutoClickerSettings.mouseAction,
    ),
    clickPositionEnabled:
      typeof settings?.clickPositionEnabled === "boolean"
        ? settings.clickPositionEnabled
        : defaultAutoClickerSettings.clickPositionEnabled,
    clickPositionDotsVisible:
      typeof settings?.clickPositionDotsVisible === "boolean"
        ? settings.clickPositionDotsVisible
        : defaultAutoClickerSettings.clickPositionDotsVisible,
    clickPositionHotkey: normalizeHotkey(
      clickPositionHotkey
        ? {
            code:
              typeof clickPositionHotkey.code === "string"
                ? clickPositionHotkey.code
                : "",
            label:
              typeof clickPositionHotkey.label === "string"
                ? clickPositionHotkey.label
                : defaultAutoClickerSettings.clickPositionHotkey.label,
            source: normalizeHotkeySource(clickPositionHotkey.source),
          }
        : defaultAutoClickerSettings.clickPositionHotkey,
    ),
    clickPositions: normalizedClickPositions,
    jitterEnabled:
      typeof settings?.jitterEnabled === "boolean"
        ? settings.jitterEnabled
        : defaultAutoClickerSettings.jitterEnabled,
    jitterMode: resolveOption(
      settings?.jitterMode,
      jitterModes,
      defaultAutoClickerSettings.jitterMode,
    ),
    jitterX:
      typeof settings?.jitterX === "string"
        ? settings.jitterX
        : defaultAutoClickerSettings.jitterX,
    jitterY:
      typeof settings?.jitterY === "string"
        ? settings.jitterY
        : defaultAutoClickerSettings.jitterY,
    doubleClickEnabled:
      typeof settings?.doubleClickEnabled === "boolean"
        ? settings.doubleClickEnabled
        : defaultAutoClickerSettings.doubleClickEnabled,
    doubleClickDelay:
      typeof settings?.doubleClickDelay === "string"
        ? settings.doubleClickDelay
        : defaultAutoClickerSettings.doubleClickDelay,
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
      defaultAutoClickerSettings.timeLimitUnit,
    ),
  };
}
