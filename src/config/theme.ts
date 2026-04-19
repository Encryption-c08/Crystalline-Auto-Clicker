import {
  isDarkColor,
  mixColors,
  normalizeHexColor,
  pickContrastingTextColor,
  withAlpha,
} from "@/lib/color";

export type AppThemeMode = "dark" | "light";

export type ThemePresetId = "ember" | "frost" | "onyx" | "tidal";

export type ThemeColorKey =
  | "accent"
  | "background"
  | "edgeStopFill"
  | "edgeStopLine"
  | "mutedText"
  | "panel"
  | "panelBorder"
  | "text";

export type ThemeColors = Record<ThemeColorKey, string>;

export type SavedThemeColors = Partial<Record<ThemeColorKey, string>>;

export type OverlayVisualTheme = {
  edgeStopFill: string;
  edgeStopLine: string;
  processPickerBackground: string;
  processPickerBorder: string;
  processPickerText: string;
};

export type ThemePreset = {
  colors: ThemeColors;
  description: string;
  id: ThemePresetId;
  label: string;
  mode: AppThemeMode;
};

export const themeColorKeys: ThemeColorKey[] = [
  "background",
  "panel",
  "panelBorder",
  "text",
  "mutedText",
  "accent",
  "edgeStopFill",
  "edgeStopLine",
];

export const editableThemeColorKeys: ThemeColorKey[] = [...themeColorKeys];

export const themeColorLabels: Record<ThemeColorKey, string> = {
  accent: "Accent",
  background: "Background",
  edgeStopFill: "Edge Stop Fill",
  edgeStopLine: "Edge Stop Outline",
  mutedText: "Muted Text",
  panel: "Panel",
  panelBorder: "Panel Border",
  text: "Text",
};

export const themeColorDescriptions: Record<ThemeColorKey, string> = {
  accent: "Buttons, focus rings, and highlight states.",
  background: "The main app canvas and dock surfaces.",
  edgeStopFill: "The translucent fill inside the edge stop overlay bars.",
  edgeStopLine: "The line and glow around the edge stop overlay bars.",
  mutedText: "Secondary labels and supporting copy.",
  panel: "Cards, sections, and picker surfaces.",
  panelBorder: "Panel outlines and separators.",
  text: "Primary labels and content.",
};

export const themePresets: ThemePreset[] = [
  {
    colors: {
      accent: "#67D0FF",
      background: "#12161D",
      edgeStopFill: "#8ED8FF",
      edgeStopLine: "#ECF7FF",
      mutedText: "#8DA0BC",
      panel: "#1B2330",
      panelBorder: "#334155",
      text: "#E8EDF6",
    },
    description: "Default graphite panels with cold glass highlights.",
    id: "onyx",
    label: "Onyx",
    mode: "dark",
  },
  {
    colors: {
      accent: "#2D74FF",
      background: "#EEF4FF",
      edgeStopFill: "#7BB5FF",
      edgeStopLine: "#1D4ED8",
      mutedText: "#607089",
      panel: "#FFFFFF",
      panelBorder: "#C8D5EB",
      text: "#0F1B2D",
    },
    description: "Bright frosted panels with sharp blue contrast.",
    id: "frost",
    label: "Frost",
    mode: "light",
  },
  {
    colors: {
      accent: "#FF8A52",
      background: "#1A1412",
      edgeStopFill: "#FFB28F",
      edgeStopLine: "#FFF0E8",
      mutedText: "#D2A590",
      panel: "#271D1A",
      panelBorder: "#5A3C31",
      text: "#FFE7DC",
    },
    description: "Warm ember panels with copper accents and glow.",
    id: "ember",
    label: "Ember",
    mode: "dark",
  },
  {
    colors: {
      accent: "#2DC8A4",
      background: "#0D1720",
      edgeStopFill: "#67E8CF",
      edgeStopLine: "#DCFFF8",
      mutedText: "#7EA7BA",
      panel: "#132430",
      panelBorder: "#245067",
      text: "#DFF8FF",
    },
    description: "Deep tidal blues with a bright teal accent.",
    id: "tidal",
    label: "Tidal",
    mode: "dark",
  },
];

export const themePresetsById = Object.fromEntries(
  themePresets.map((preset) => [preset.id, preset]),
) as Record<ThemePresetId, ThemePreset>;

export const defaultThemePresetId: ThemePresetId = "onyx";

export const defaultThemeColors = cloneThemeColors(
  themePresetsById[defaultThemePresetId].colors,
);

export const defaultOverlayVisualTheme =
  buildOverlayVisualTheme(defaultThemeColors);

export function cloneThemeColors(colors: ThemeColors): ThemeColors {
  return { ...colors };
}

export function resolveThemePresetId(value: string | null | undefined) {
  return value && value in themePresetsById
    ? (value as ThemePresetId)
    : defaultThemePresetId;
}

export function normalizeThemeColors(
  savedColors: SavedThemeColors | null | undefined,
  presetId: ThemePresetId,
) {
  const presetColors = themePresetsById[presetId].colors;

  return themeColorKeys.reduce((colors, key) => {
    colors[key] = normalizeHexColor(savedColors?.[key], presetColors[key]);
    return colors;
  }, {} as ThemeColors);
}

export function areThemeColorsEqual(first: ThemeColors, second: ThemeColors) {
  return themeColorKeys.every(
    (key) => normalizeHexColor(first[key]) === normalizeHexColor(second[key]),
  );
}

export function deriveThemeModeFromColors(colors: ThemeColors): AppThemeMode {
  return isDarkColor(colors.background) ? "dark" : "light";
}

export function buildOverlayVisualTheme(
  colors: ThemeColors,
): OverlayVisualTheme {
  return {
    edgeStopFill: normalizeHexColor(colors.edgeStopFill),
    edgeStopLine: normalizeHexColor(colors.edgeStopLine),
    processPickerBackground: mixColors(colors.panel, colors.background, 0.08),
    processPickerBorder: normalizeHexColor(colors.panelBorder),
    processPickerText: normalizeHexColor(colors.text),
  };
}

export function buildThemeCssVariables(colors: ThemeColors) {
  const background = normalizeHexColor(colors.background);
  const panel = normalizeHexColor(colors.panel);
  const border = normalizeHexColor(colors.panelBorder);
  const text = normalizeHexColor(colors.text);
  const mutedText = normalizeHexColor(colors.mutedText);
  const accent = normalizeHexColor(colors.accent);
  const accentForeground = pickContrastingTextColor(accent);
  const secondary = mixColors(panel, background, 0.22);
  const muted = mixColors(panel, background, 0.34);
  const accentSurface = mixColors(accent, background, 0.8);
  const input = mixColors(panel, border, 0.45);
  const scrollbarTrack = withAlpha(background, 0.78);
  const scrollbarThumb = withAlpha(text, 0.24);
  const scrollbarThumbHover = withAlpha(text, 0.36);
  const scrollbarThumbBorder = withAlpha(background, 0.92);

  return {
    "--accent": accentSurface,
    "--accent-foreground": text,
    "--background": background,
    "--border": border,
    "--card": panel,
    "--card-foreground": text,
    "--chart-1": accent,
    "--chart-2": mixColors(accent, text, 0.45),
    "--chart-3": mixColors(panel, text, 0.62),
    "--chart-4": mixColors(border, text, 0.38),
    "--chart-5": mixColors(background, text, 0.7),
    "--destructive": "#E25555",
    "--foreground": text,
    "--input": input,
    "--muted": muted,
    "--muted-foreground": mutedText,
    "--popover": mixColors(panel, background, 0.1),
    "--popover-foreground": text,
    "--primary": accent,
    "--primary-foreground": accentForeground,
    "--ring": accent,
    "--secondary": secondary,
    "--secondary-foreground": text,
    "--sidebar": panel,
    "--sidebar-accent": accentSurface,
    "--sidebar-accent-foreground": text,
    "--sidebar-border": border,
    "--sidebar-foreground": text,
    "--sidebar-primary": accent,
    "--sidebar-primary-foreground": accentForeground,
    "--sidebar-ring": accent,
    "--theme-accent": accent,
    "--theme-edge-stop-fill": normalizeHexColor(colors.edgeStopFill),
    "--theme-edge-stop-line": normalizeHexColor(colors.edgeStopLine),
    "--theme-panel": panel,
    "--theme-panel-border": border,
    "--theme-text": text,
    "--ui-scrollbar-thumb": scrollbarThumb,
    "--ui-scrollbar-thumb-border": scrollbarThumbBorder,
    "--ui-scrollbar-thumb-hover": scrollbarThumbHover,
    "--ui-scrollbar-track": scrollbarTrack,
  } satisfies Record<string, string>;
}

export function applyThemeCssVariables(
  element: HTMLElement,
  variables: Record<string, string>,
) {
  for (const [name, value] of Object.entries(variables)) {
    element.style.setProperty(name, value);
  }
}
