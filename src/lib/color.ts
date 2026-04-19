export type RgbColor = {
  b: number;
  g: number;
  r: number;
};

export type HsvColor = {
  h: number;
  s: number;
  v: number;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function channelToHex(value: number) {
  return clampNumber(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

export function tryNormalizeHexColor(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const sanitized = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(sanitized)) {
    return null;
  }

  const expanded =
    sanitized.length === 3
      ? sanitized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : sanitized;

  return `#${expanded.toUpperCase()}`;
}

export function normalizeHexColor(
  value: string | null | undefined,
  fallback = "#000000",
) {
  return (
    tryNormalizeHexColor(value) ?? tryNormalizeHexColor(fallback) ?? "#000000"
  );
}

export function hexToRgb(color: string): RgbColor {
  const normalizedColor = normalizeHexColor(color).slice(1);

  return {
    b: Number.parseInt(normalizedColor.slice(4, 6), 16),
    g: Number.parseInt(normalizedColor.slice(2, 4), 16),
    r: Number.parseInt(normalizedColor.slice(0, 2), 16),
  };
}

export function rgbToHex(color: RgbColor) {
  return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`.toUpperCase();
}

export function rgbToHsv(color: RgbColor): HsvColor {
  const red = color.r / 255;
  const green = color.g / 255;
  const blue = color.b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
  }

  return {
    h: (hue * 60 + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

export function hsvToRgb(color: HsvColor): RgbColor {
  const hue = ((color.h % 360) + 360) % 360;
  const saturation = clampNumber(color.s, 0, 1);
  const value = clampNumber(color.v, 0, 1);
  const chroma = value * saturation;
  const hueSection = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const match = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSection >= 0 && hueSection < 1) {
    red = chroma;
    green = secondary;
  } else if (hueSection < 2) {
    red = secondary;
    green = chroma;
  } else if (hueSection < 3) {
    green = chroma;
    blue = secondary;
  } else if (hueSection < 4) {
    green = secondary;
    blue = chroma;
  } else if (hueSection < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  return {
    b: (blue + match) * 255,
    g: (green + match) * 255,
    r: (red + match) * 255,
  };
}

export function mixColors(
  colorA: string,
  colorB: string,
  amountOfColorB: number,
) {
  const mixRatio = clampNumber(amountOfColorB, 0, 1);
  const first = hexToRgb(colorA);
  const second = hexToRgb(colorB);

  return rgbToHex({
    b: first.b + (second.b - first.b) * mixRatio,
    g: first.g + (second.g - first.g) * mixRatio,
    r: first.r + (second.r - first.r) * mixRatio,
  });
}

export function withAlpha(color: string, alpha: number) {
  const { b, g, r } = hexToRgb(color);
  const normalizedAlpha = clampNumber(alpha, 0, 1);

  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

function linearizeChannel(value: number) {
  const normalizedValue = value / 255;

  return normalizedValue <= 0.03928
    ? normalizedValue / 12.92
    : ((normalizedValue + 0.055) / 1.055) ** 2.4;
}

export function getRelativeLuminance(color: string) {
  const { b, g, r } = hexToRgb(color);

  return (
    0.2126 * linearizeChannel(r) +
    0.7152 * linearizeChannel(g) +
    0.0722 * linearizeChannel(b)
  );
}

export function isDarkColor(color: string, threshold = 0.34) {
  return getRelativeLuminance(color) < threshold;
}

export function pickContrastingTextColor(
  backgroundColor: string,
  darkText = "#09101B",
  lightText = "#F8FBFF",
) {
  return isDarkColor(backgroundColor) ? lightText : darkText;
}
