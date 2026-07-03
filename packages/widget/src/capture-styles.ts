const UNSAFE_COLOR_FUNCTION_PATTERN = /\b(?:oklch|oklab|lch|lab|color)\(/i;
const COLOR_FUNCTION_NAMES = ["oklch", "oklab", "lch", "lab", "color"] as const;
const CSS_COLOR_PROPERTIES = [
  "color",
  "background-color",
  "border-block-color",
  "border-block-end-color",
  "border-block-start-color",
  "border-bottom-color",
  "border-color",
  "border-inline-color",
  "border-inline-end-color",
  "border-inline-start-color",
  "border-left-color",
  "border-right-color",
  "border-top-color",
  "caret-color",
  "column-rule-color",
  "fill",
  "flood-color",
  "lighting-color",
  "outline-color",
  "stop-color",
  "stroke",
  "text-decoration-color",
  "text-emphasis-color",
] as const;
const CSS_COLOR_LIST_PROPERTIES = [
  "background",
  "background-image",
  "border-image",
  "box-shadow",
  "filter",
  "text-shadow",
] as const;

interface RgbColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stripFunction(raw: string): { name: string; body: string } | null {
  const match = raw.trim().match(/^([a-z0-9-]+)\((.*)\)$/i);
  if (!match) return null;
  return {
    name: match[1]?.toLowerCase() ?? "",
    body: match[2] ?? "",
  };
}

function splitColorArgs(body: string): string[] {
  return body
    .trim()
    .replace(/\s*,\s*/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .split(/\s+/)
    .filter(Boolean);
}

function parseFiniteNumber(raw: string): number | null {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercentOrNumber(
  raw: string | undefined,
  percentScale = 1,
): number | null {
  if (!raw || raw.toLowerCase() === "none") return null;
  const parsed = parseFiniteNumber(raw);
  if (parsed === null) return null;
  return raw.trim().endsWith("%") ? (parsed / 100) * percentScale : parsed;
}

function parseAlpha(raw: string | undefined): number {
  const parsed = parsePercentOrNumber(raw);
  return parsed === null ? 1 : clamp(parsed, 0, 1);
}

function parseLightness(raw: string | undefined): number | null {
  const parsed = parsePercentOrNumber(raw);
  if (parsed === null) return null;
  return clamp(parsed > 1 ? parsed / 100 : parsed, 0, 1);
}

function parseHueToDegrees(raw: string | undefined): number | null {
  if (!raw || raw.toLowerCase() === "none") return 0;
  const normalized = raw.trim().toLowerCase();
  const parsed = parseFiniteNumber(normalized);
  if (parsed === null) return null;
  if (normalized.endsWith("turn")) return parsed * 360;
  if (normalized.endsWith("rad")) return (parsed * 180) / Math.PI;
  if (normalized.endsWith("grad")) return parsed * 0.9;
  return parsed;
}

function parseChroma(raw: string | undefined, percentScale: number): number | null {
  return parsePercentOrNumber(raw, percentScale);
}

function parseSignedAxis(raw: string | undefined, percentScale: number): number | null {
  return parsePercentOrNumber(raw, percentScale);
}

function linearToSrgb(value: number): number {
  if (value <= 0.0031308) return 12.92 * value;
  return 1.055 * value ** (1 / 2.4) - 0.055;
}

function oklabToRgb(lightness: number, aAxis: number, bAxis: number, alpha = 1): RgbColor {
  const lPrime = lightness + 0.3963377774 * aAxis + 0.2158037573 * bAxis;
  const mPrime = lightness - 0.1055613458 * aAxis - 0.0638541728 * bAxis;
  const sPrime = lightness - 0.0894841775 * aAxis - 1.291485548 * bAxis;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  return {
    r: clamp(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), 0, 1),
    g: clamp(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), 0, 1),
    b: clamp(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s), 0, 1),
    a: alpha,
  };
}

function labToXyzComponent(value: number): number {
  const cubed = value ** 3;
  if (cubed > 216 / 24389) return cubed;
  return (116 * value - 16) / (24389 / 27);
}

function labToRgb(lightness: number, aAxis: number, bAxis: number, alpha = 1): RgbColor {
  const fy = (lightness + 16) / 116;
  const fx = fy + aAxis / 500;
  const fz = fy - bAxis / 200;

  const xD50 = labToXyzComponent(fx) * 0.96422;
  const yD50 = labToXyzComponent(fy);
  const zD50 = labToXyzComponent(fz) * 0.82521;

  const xD65 = 0.9555766 * xD50 - 0.0230393 * yD50 + 0.0631636 * zD50;
  const yD65 = -0.0282895 * xD50 + 1.0099416 * yD50 + 0.0210077 * zD50;
  const zD65 = 0.0122982 * xD50 - 0.020483 * yD50 + 1.3299098 * zD50;

  return {
    r: clamp(linearToSrgb(3.2404542 * xD65 - 1.5371385 * yD65 - 0.4985314 * zD65), 0, 1),
    g: clamp(linearToSrgb(-0.969266 * xD65 + 1.8760108 * yD65 + 0.041556 * zD65), 0, 1),
    b: clamp(linearToSrgb(0.0556434 * xD65 - 0.2040259 * yD65 + 1.0572252 * zD65), 0, 1),
    a: alpha,
  };
}

function formatRgb({ r, g, b, a }: RgbColor): string {
  const red = Math.round(clamp(r, 0, 1) * 255);
  const green = Math.round(clamp(g, 0, 1) * 255);
  const blue = Math.round(clamp(b, 0, 1) * 255);
  if (a >= 0.999) return `rgb(${red}, ${green}, ${blue})`;
  return `rgba(${red}, ${green}, ${blue}, ${Math.round(clamp(a, 0, 1) * 1000) / 1000})`;
}

function parseOklch(body: string): RgbColor | null {
  const args = splitColorArgs(body);
  const slashIndex = args.indexOf("/");
  const colorArgs = slashIndex === -1 ? args : args.slice(0, slashIndex);
  const alphaArg = slashIndex === -1 ? undefined : args[slashIndex + 1];
  const lightness = parseLightness(colorArgs[0]);
  const chroma = parseChroma(colorArgs[1], 0.4);
  const hue = parseHueToDegrees(colorArgs[2]);
  if (lightness === null || chroma === null || hue === null) return null;
  const radians = (hue * Math.PI) / 180;
  return oklabToRgb(
    lightness,
    chroma * Math.cos(radians),
    chroma * Math.sin(radians),
    parseAlpha(alphaArg),
  );
}

function parseOklab(body: string): RgbColor | null {
  const args = splitColorArgs(body);
  const slashIndex = args.indexOf("/");
  const colorArgs = slashIndex === -1 ? args : args.slice(0, slashIndex);
  const alphaArg = slashIndex === -1 ? undefined : args[slashIndex + 1];
  const lightness = parseLightness(colorArgs[0]);
  const aAxis = parseSignedAxis(colorArgs[1], 0.4);
  const bAxis = parseSignedAxis(colorArgs[2], 0.4);
  if (lightness === null || aAxis === null || bAxis === null) return null;
  return oklabToRgb(lightness, aAxis, bAxis, parseAlpha(alphaArg));
}

function parseLch(body: string): RgbColor | null {
  const args = splitColorArgs(body);
  const slashIndex = args.indexOf("/");
  const colorArgs = slashIndex === -1 ? args : args.slice(0, slashIndex);
  const alphaArg = slashIndex === -1 ? undefined : args[slashIndex + 1];
  const lightness = parsePercentOrNumber(colorArgs[0], 100);
  const chroma = parseChroma(colorArgs[1], 150);
  const hue = parseHueToDegrees(colorArgs[2]);
  if (lightness === null || chroma === null || hue === null) return null;
  const radians = (hue * Math.PI) / 180;
  return labToRgb(
    clamp(lightness, 0, 100),
    chroma * Math.cos(radians),
    chroma * Math.sin(radians),
    parseAlpha(alphaArg),
  );
}

function parseLab(body: string): RgbColor | null {
  const args = splitColorArgs(body);
  const slashIndex = args.indexOf("/");
  const colorArgs = slashIndex === -1 ? args : args.slice(0, slashIndex);
  const alphaArg = slashIndex === -1 ? undefined : args[slashIndex + 1];
  const lightness = parsePercentOrNumber(colorArgs[0], 100);
  const aAxis = parseSignedAxis(colorArgs[1], 125);
  const bAxis = parseSignedAxis(colorArgs[2], 125);
  if (lightness === null || aAxis === null || bAxis === null) return null;
  return labToRgb(clamp(lightness, 0, 100), aAxis, bAxis, parseAlpha(alphaArg));
}

function parseColorFunction(body: string): RgbColor | null {
  const args = splitColorArgs(body);
  const colorSpace = args[0]?.toLowerCase();
  if (!colorSpace || !["srgb", "srgb-linear", "display-p3"].includes(colorSpace)) {
    return null;
  }
  const slashIndex = args.indexOf("/");
  const colorArgs =
    slashIndex === -1 ? args.slice(1) : args.slice(1, slashIndex);
  const alphaArg = slashIndex === -1 ? undefined : args[slashIndex + 1];
  const red = parsePercentOrNumber(colorArgs[0]);
  const green = parsePercentOrNumber(colorArgs[1]);
  const blue = parsePercentOrNumber(colorArgs[2]);
  if (red === null || green === null || blue === null) return null;
  return {
    r: clamp(red, 0, 1),
    g: clamp(green, 0, 1),
    b: clamp(blue, 0, 1),
    a: parseAlpha(alphaArg),
  };
}

function parseUnsupportedColorFunction(raw: string): string | null {
  const parsed = stripFunction(raw);
  if (!parsed) return null;
  const rgb =
    parsed.name === "oklch"
      ? parseOklch(parsed.body)
      : parsed.name === "oklab"
        ? parseOklab(parsed.body)
        : parsed.name === "lch"
          ? parseLch(parsed.body)
          : parsed.name === "lab"
            ? parseLab(parsed.body)
            : parsed.name === "color"
              ? parseColorFunction(parsed.body)
              : null;
  return rgb ? formatRgb(rgb) : null;
}

function findFunctionEnd(value: string, openParenIndex: number): number {
  let depth = 0;
  for (let index = openParenIndex; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function matchColorFunctionAt(value: string, index: number): string | null {
  for (const name of COLOR_FUNCTION_NAMES) {
    if (
      value.slice(index, index + name.length).toLowerCase() === name &&
      value[index + name.length] === "("
    ) {
      return name;
    }
  }
  return null;
}

export function hasUnsupportedColorFunction(value: string): boolean {
  return UNSAFE_COLOR_FUNCTION_PATTERN.test(value);
}

export function normalizeCssColorForCanvas(
  value: string,
  fallback = "rgb(0, 0, 0)",
): string {
  if (!hasUnsupportedColorFunction(value)) return value;

  let output = "";
  let index = 0;
  while (index < value.length) {
    const functionName = matchColorFunctionAt(value, index);
    if (!functionName) {
      output += value[index] ?? "";
      index += 1;
      continue;
    }

    const openParenIndex = index + functionName.length;
    const closeParenIndex = findFunctionEnd(value, openParenIndex);
    if (closeParenIndex === -1) {
      output += value.slice(index);
      break;
    }

    const rawFunction = value.slice(index, closeParenIndex + 1);
    output += parseUnsupportedColorFunction(rawFunction) ?? fallback;
    index = closeParenIndex + 1;
  }

  return output;
}

function getStyleValue(
  computedStyle: CSSStyleDeclaration,
  inlineStyle: CSSStyleDeclaration,
  property: string,
): string {
  return (
    computedStyle.getPropertyValue(property) ||
    inlineStyle.getPropertyValue(property) ||
    ""
  ).trim();
}

export function sanitizeClonedDocumentForCanvas(
  sourceDocument: Document,
  clonedDocument: Document,
): void {
  const sourceView = sourceDocument.defaultView ?? window;
  const sourceElements = [
    sourceDocument.documentElement,
    ...Array.from(sourceDocument.documentElement.querySelectorAll("*")),
  ];
  const clonedElements = [
    clonedDocument.documentElement,
    ...Array.from(clonedDocument.documentElement.querySelectorAll("*")),
  ];
  const count = Math.min(sourceElements.length, clonedElements.length);

  const clonedView = clonedDocument.defaultView ?? window;

  for (let index = 0; index < count; index += 1) {
    const sourceElement = sourceElements[index];
    const clonedElement = clonedElements[index];
    if (!(sourceElement instanceof sourceView.Element)) continue;
    if (!(clonedElement instanceof clonedView.HTMLElement)) continue;

    const sourceStyle = sourceView.getComputedStyle(sourceElement);
    const inlineStyle = (sourceElement as HTMLElement).style;
    const clonedStyle = clonedElement.style;

    for (const property of CSS_COLOR_PROPERTIES) {
      const value = getStyleValue(sourceStyle, inlineStyle, property);
      if (value && hasUnsupportedColorFunction(value)) {
        clonedStyle.setProperty(property, normalizeCssColorForCanvas(value));
      }
    }

    for (const property of CSS_COLOR_LIST_PROPERTIES) {
      const value = getStyleValue(sourceStyle, inlineStyle, property);
      if (value && hasUnsupportedColorFunction(value)) {
        clonedStyle.setProperty(property, normalizeCssColorForCanvas(value, "rgb(0, 0, 0)"));
      }
    }
  }
}
