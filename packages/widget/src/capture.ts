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

export interface CaptureFileParts {
  routeSlug: string;
  surfaceSlug: string;
  dateStamp: string;
  timestamp: string;
  fileName: string;
  relativeDir: string;
  relativePath: string;
}

export function clampQualityToScale(quality: number): number {
  const bounded = Math.min(100, Math.max(1, Math.round(quality)));
  const scaled = 1 + ((bounded - 1) / 99);
  return Math.round(scaled * 100) / 100;
}

function slugifySegment(value: string, fallback: string): string {
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

function formatDateStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

function formatTimestamp(date: Date): string {
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
  const fileName = `${routeSlug}-${payload.mode}-${surfaceSlug}-${payload.theme}-v2-${timestamp}.${ext}`;
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
