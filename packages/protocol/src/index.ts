export type CaptureMode = "element" | "viewport" | "fullpage";
export type CaptureFormat = "png" | "jpeg";
export type ThemeSelection = "current" | "both";
export type ThemeValue = "light" | "dark";

export interface CapturePayload {
  project: string;
  route: string;
  mode: CaptureMode;
  format: CaptureFormat;
  quality: number;
  scale: number;
  theme: ThemeValue;
  selector?: string;
  selectorName?: string;
  viewport: { width: number; height: number; dpr: number };
  capturedAt: string;
  imageBase64: string;
}

export interface SaveResult {
  ok: true;
  relativePath: string;
  absolutePath: string;
  bytes: number;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface CaptureFileParts {
  routeSlug: string;
  surfaceSlug: string;
  dateStamp: string;
  timestamp: string;
  fileName: string;
  relativeDir: string;
  relativePath: string;
}

const MODE_SET: ReadonlySet<CaptureMode> = new Set([
  "element",
  "viewport",
  "fullpage",
]);
const FORMAT_SET: ReadonlySet<CaptureFormat> = new Set(["png", "jpeg"]);
const THEME_SET: ReadonlySet<ThemeValue> = new Set(["light", "dark"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(
  value: unknown,
  fieldName: string,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return { ok: false, error: `${fieldName} must be a string.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: `${fieldName} must be a non-empty string.` };
  }
  return { ok: true, value: trimmed };
}

function asNumber(
  value: unknown,
  fieldName: string,
  min?: number,
  max?: number,
): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `${fieldName} must be a finite number.` };
  }
  if (min !== undefined && value < min) {
    return { ok: false, error: `${fieldName} must be >= ${min}.` };
  }
  if (max !== undefined && value > max) {
    return { ok: false, error: `${fieldName} must be <= ${max}.` };
  }
  return { ok: true, value };
}

function asInteger(
  value: unknown,
  fieldName: string,
  min: number,
  max: number,
): ValidationResult<number> {
  const parsed = asNumber(value, fieldName, min, max);
  if (!parsed.ok) return parsed;
  if (!Number.isInteger(parsed.value)) {
    return { ok: false, error: `${fieldName} must be an integer.` };
  }
  return parsed;
}

export function clampQualityToScale(quality: number): number {
  const bounded = Math.min(100, Math.max(1, Math.round(quality)));
  const scaled = 1 + ((bounded - 1) / 99);
  return Math.round(scaled * 100) / 100;
}

export function slugifySegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

export function formatTimestamp(date: Date): string {
  return `${formatDateStamp(date)}-${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}`;
}

export function buildCaptureFileParts(payload: {
  route: string;
  mode: CaptureMode;
  selector?: string;
  selectorName?: string;
  theme: ThemeValue;
  format: CaptureFormat;
  capturedAt: string;
}): CaptureFileParts {
  const date = new Date(payload.capturedAt);
  const usableDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const routeSlug = slugifySegment(payload.route, "route");
  const rawSurface =
    payload.mode === "element"
      ? payload.selectorName || payload.selector || "selected-element"
      : payload.mode === "viewport"
        ? "viewport"
        : "fullpage";
  const surfaceSlug = slugifySegment(rawSurface, "surface");
  const dateStamp = formatDateStamp(usableDate);
  const timestamp = formatTimestamp(usableDate);
  const ext = payload.format === "jpeg" ? "jpg" : "png";
  const fileName = `${routeSlug}-${payload.mode}-${surfaceSlug}-${payload.theme}-${timestamp}.${ext}`;
  const relativeDir = `live-${dateStamp}/${routeSlug}`;
  const relativePath = `${relativeDir}/${fileName}`;
  return {
    routeSlug,
    surfaceSlug,
    dateStamp,
    timestamp,
    fileName,
    relativeDir,
    relativePath,
  };
}

export function validateCapturePayload(input: unknown): ValidationResult<CapturePayload> {
  if (!isRecord(input)) {
    return { ok: false, error: "Payload must be an object." };
  }

  const project = asTrimmedString(input.project, "project");
  if (!project.ok) return project;

  const route = asTrimmedString(input.route, "route");
  if (!route.ok) return route;

  if (typeof input.mode !== "string" || !MODE_SET.has(input.mode as CaptureMode)) {
    return { ok: false, error: "mode must be one of: element, viewport, fullpage." };
  }
  const mode = input.mode as CaptureMode;

  if (
    typeof input.format !== "string" ||
    !FORMAT_SET.has(input.format as CaptureFormat)
  ) {
    return { ok: false, error: "format must be one of: png, jpeg." };
  }
  const format = input.format as CaptureFormat;

  const quality = asInteger(input.quality, "quality", 1, 100);
  if (!quality.ok) return quality;

  const scale = asNumber(input.scale, "scale", 1, 2);
  if (!scale.ok) return scale;

  if (typeof input.theme !== "string" || !THEME_SET.has(input.theme as ThemeValue)) {
    return { ok: false, error: "theme must be one of: light, dark." };
  }
  const theme = input.theme as ThemeValue;

  let selector: string | undefined;
  if (input.selector !== undefined) {
    const parsed = asTrimmedString(input.selector, "selector");
    if (!parsed.ok) return parsed;
    selector = parsed.value;
  }

  let selectorName: string | undefined;
  if (input.selectorName !== undefined) {
    const parsed = asTrimmedString(input.selectorName, "selectorName");
    if (!parsed.ok) return parsed;
    selectorName = parsed.value;
  }

  if (mode === "element" && !selector && !selectorName) {
    return {
      ok: false,
      error: "selector or selectorName is required when mode is element.",
    };
  }

  if (!isRecord(input.viewport)) {
    return { ok: false, error: "viewport must be an object." };
  }
  const width = asNumber(input.viewport.width, "viewport.width", 1);
  if (!width.ok) return width;
  const height = asNumber(input.viewport.height, "viewport.height", 1);
  if (!height.ok) return height;
  const dpr = asNumber(input.viewport.dpr, "viewport.dpr", 0.1);
  if (!dpr.ok) return dpr;

  const capturedAt = asTrimmedString(input.capturedAt, "capturedAt");
  if (!capturedAt.ok) return capturedAt;
  const capturedDate = new Date(capturedAt.value);
  if (Number.isNaN(capturedDate.getTime())) {
    return { ok: false, error: "capturedAt must be a valid ISO date string." };
  }

  const imageBase64 = asTrimmedString(input.imageBase64, "imageBase64");
  if (!imageBase64.ok) return imageBase64;

  return {
    ok: true,
    value: {
      project: project.value,
      route: route.value,
      mode,
      format,
      quality: quality.value,
      scale: scale.value,
      theme,
      selector,
      selectorName,
      viewport: {
        width: width.value,
        height: height.value,
        dpr: dpr.value,
      },
      capturedAt: capturedAt.value,
      imageBase64: imageBase64.value,
    },
  };
}
