"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas-pro";
import { toCanvas } from "html-to-image";
import {
  clampQualityToScale,
  type CaptureFormat,
  type CaptureMode,
  type CapturePayload,
  type SaveResult,
  type ThemeSelection,
  type ThemeValue,
} from "@screenshotter/protocol";

const UI_MARKER_ATTR = "data-screenshotter-ui";
const CAPTURE_COLOR_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "text-shadow",
  "box-shadow",
  "caret-color",
  "fill",
  "stroke",
  "-webkit-text-fill-color",
  "-webkit-text-stroke-color",
] as const;

type Html2CanvasOptions = NonNullable<Parameters<typeof html2canvas>[1]>;
const OKLCH_LIKE_TOKEN_PATTERN = /\bokl(?:ab|ch)\([^)]*\)/gi;
const CSS_NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const OKL_TOKEN_CACHE = new Map<string, string>();
let oklColorResolverElement: HTMLSpanElement | null = null;

type StatusState =
  | { kind: "idle"; message: string }
  | { kind: "saving"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | { kind: "info"; message: string };

export interface ScreenshotterWidgetProps {
  endpoint?: string;
  token?: string;
  enabled?: boolean;
  project?: string;
  elementPaddingPx?: number;
  captureSettleMs?: number;
  defaultMode?: CaptureMode;
  themeSelectionDefault?: ThemeSelection;
  themeAdapter?: {
    getCurrentTheme: () => ThemeValue;
    setTheme: (theme: ThemeValue) => void | Promise<void>;
  };
  onSaved?: (result: SaveResult) => void;
  onError?: (message: string) => void;
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForVisualAssetsReady(timeoutMs = 2500): Promise<void> {
  const fontsPromise =
    typeof document !== "undefined" && "fonts" in document
      ? (document as Document & { fonts?: FontFaceSet }).fonts?.ready
      : undefined;

  const imageDecodes =
    typeof document !== "undefined"
      ? Array.from(document.images)
          .filter((image) => !image.complete)
          .map((image) => image.decode().catch(() => undefined))
      : [];

  await Promise.race([
    Promise.all([
      fontsPromise?.catch(() => undefined),
      Promise.all(imageDecodes),
    ]),
    waitForMs(timeoutMs),
  ]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return target.isContentEditable;
}

function inferCurrentTheme(): ThemeValue {
  const root = document.documentElement;
  if (
    root.classList.contains("dark") ||
    root.dataset.theme === "dark" ||
    root.getAttribute("data-mode") === "dark"
  ) {
    return "dark";
  }
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function oppositeTheme(theme: ThemeValue): ThemeValue {
  return theme === "light" ? "dark" : "light";
}

function toSelectorName(element: HTMLElement): string {
  const preferred =
    element.getAttribute("aria-label") ||
    element.getAttribute("data-testid") ||
    element.getAttribute("data-test") ||
    element.id;
  if (preferred) return preferred;
  const className =
    typeof element.className === "string" ? element.className.trim().split(/\s+/)[0] : "";
  if (className) return className;
  return element.tagName.toLowerCase();
}

function toSelector(element: HTMLElement): string {
  if (element.id) return `#${element.id}`;
  const testId =
    element.getAttribute("data-testid") || element.getAttribute("data-test");
  if (testId) return `[data-testid="${testId}"]`;
  const classList = Array.from(element.classList).slice(0, 2);
  if (classList.length) {
    return `${element.tagName.toLowerCase()}.${classList.join(".")}`;
  }
  return element.tagName.toLowerCase();
}

function numberFromPx(raw: string): number {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTransparentColor(raw: string): boolean {
  const value = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!value || value === "transparent") return true;
  if (value === "rgba(0,0,0,0)") return true;
  const rgba = value.match(/^rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/);
  if (!rgba) return false;
  const alpha = Number.parseFloat(rgba[4] || "1");
  return Number.isFinite(alpha) && alpha <= 0;
}

function isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function resolveElementCaptureTarget(rawTarget: HTMLElement): HTMLElement {
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const maxDepth = 8;
  let fallback = rawTarget;
  let fallbackArea = Number.POSITIVE_INFINITY;

  for (
    let current: HTMLElement | null = rawTarget, depth = 0;
    current && current !== document.body && current !== document.documentElement && depth <= maxDepth;
    current = current.parentElement, depth += 1
  ) {
    if (isWidgetElement(current)) continue;

    const rect = current.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;

    const area = rect.width * rect.height;
    const areaRatio = area / viewportArea;
    if (areaRatio >= 0.55) continue;

    const computed = window.getComputedStyle(current);
    const borderWidth =
      numberFromPx(computed.borderTopWidth) +
      numberFromPx(computed.borderRightWidth) +
      numberFromPx(computed.borderBottomWidth) +
      numberFromPx(computed.borderLeftWidth);
    const hasBackground = !isTransparentColor(computed.backgroundColor);
    const hasBorder = borderWidth > 0;
    const hasShadow = Boolean(computed.boxShadow && computed.boxShadow !== "none");
    const hasRadius =
      numberFromPx(computed.borderTopLeftRadius) > 0 ||
      numberFromPx(computed.borderTopRightRadius) > 0 ||
      numberFromPx(computed.borderBottomLeftRadius) > 0 ||
      numberFromPx(computed.borderBottomRightRadius) > 0;
    const isInline = computed.display.startsWith("inline");
    const isLayoutContainer =
      (computed.display.includes("flex") || computed.display.includes("grid")) &&
      current.children.length > 1 &&
      !hasBackground &&
      !hasBorder &&
      !hasShadow;

    if (!isInline && area < fallbackArea) {
      fallback = current;
      fallbackArea = area;
    }

    const hasVisualSurface = hasBackground || hasBorder || hasShadow || hasRadius;
    if (hasVisualSurface && areaRatio <= 0.18) {
      return current;
    }

    // Allow compact semantic blocks, but avoid broad row/page wrappers.
    if (!isLayoutContainer && !isInline && depth <= 2 && areaRatio <= 0.08) {
      return current;
    }
  }

  return fallback;
}

function toFriendlyError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function isWidgetElement(element: HTMLElement | null): boolean {
  if (!element) return false;
  return element.closest(`[${UI_MARKER_ATTR}="true"]`) !== null;
}

function statusColor(kind: StatusState["kind"]): string {
  if (kind === "error") return "#ff9f8f";
  if (kind === "success") return "#86efac";
  if (kind === "saving") return "#c7d2fe";
  if (kind === "info") return "#93c5fd";
  return "#9ca3af";
}

function getDomCaptureTarget(mode: CaptureMode, element: HTMLElement | null): HTMLElement {
  if (mode === "element") {
    if (!element) {
      throw new Error("No element selected for element capture.");
    }
    return element;
  }
  return document.documentElement;
}

function assertBrowser(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("ScreenshotterWidget can only run in a browser.");
  }
}

function hasUnsupportedColorFunction(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized.includes("oklch") || normalized.includes("oklab");
}

function isUnsupportedColorFunctionError(error: unknown): boolean {
  const message = toFriendlyError(error).toLowerCase();
  return message.includes("unsupported color function") && hasUnsupportedColorFunction(message);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseCssNumber(raw: string): number | null {
  const token = raw.trim();
  if (!CSS_NUMBER_PATTERN.test(token)) return null;
  const parsed = Number(token);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseAlpha(raw: string | null): number | null {
  if (!raw) return 1;
  const token = raw.trim().toLowerCase();
  if (!token) return 1;
  if (token.endsWith("%")) {
    const numeric = parseCssNumber(token.slice(0, -1));
    if (numeric === null) return null;
    return clamp(numeric / 100, 0, 1);
  }
  const numeric = parseCssNumber(token);
  if (numeric === null) return null;
  return clamp(numeric, 0, 1);
}

function parseHueDegrees(raw: string): number | null {
  const token = raw.trim().toLowerCase();
  if (!token || token === "none") return 0;

  const parseUnitValue = (
    suffix: string,
    multiplier: number,
  ): number | null => {
    if (!token.endsWith(suffix)) return null;
    const numeric = parseCssNumber(token.slice(0, -suffix.length));
    if (numeric === null) return null;
    return numeric * multiplier;
  };

  const unitValue =
    parseUnitValue("deg", 1) ??
    parseUnitValue("grad", 0.9) ??
    parseUnitValue("rad", 180 / Math.PI) ??
    parseUnitValue("turn", 360);
  if (unitValue !== null) return unitValue;

  return parseCssNumber(token);
}

function parseLightness(raw: string): number | null {
  const token = raw.trim().toLowerCase();
  if (!token) return null;
  if (token.endsWith("%")) {
    const numeric = parseCssNumber(token.slice(0, -1));
    if (numeric === null) return null;
    return clamp(numeric / 100, 0, 1);
  }
  const numeric = parseCssNumber(token);
  if (numeric === null) return null;
  return clamp(numeric, 0, 1);
}

function parseChroma(raw: string): number | null {
  const token = raw.trim().toLowerCase();
  if (!token) return null;
  if (token.endsWith("%")) {
    const numeric = parseCssNumber(token.slice(0, -1));
    if (numeric === null) return null;
    return Math.max(0, (numeric / 100) * 0.4);
  }
  const numeric = parseCssNumber(token);
  if (numeric === null) return null;
  return Math.max(0, numeric);
}

function parseOklabAxis(raw: string): number | null {
  const token = raw.trim().toLowerCase();
  if (!token) return null;
  if (token.endsWith("%")) {
    const numeric = parseCssNumber(token.slice(0, -1));
    if (numeric === null) return null;
    return (numeric / 100) * 0.4;
  }
  return parseCssNumber(token);
}

function splitFunctionBodyAndAlpha(body: string): {
  channelsPart: string;
  alphaPart: string | null;
} {
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "/" && depth === 0) {
      return {
        channelsPart: body.slice(0, i).trim(),
        alphaPart: body.slice(i + 1).trim(),
      };
    }
  }
  return {
    channelsPart: body.trim(),
    alphaPart: null,
  };
}

function gammaEncodeSrgb(linear: number): number {
  const abs = Math.abs(linear);
  const encoded =
    abs > 0.0031308
      ? Math.sign(linear) * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055)
      : 12.92 * linear;
  return clamp(encoded, 0, 1);
}

function oklabToSrgb(
  lightness: number,
  a: number,
  b: number,
): [number, number, number] {
  const l = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;

  const redLinear = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const greenLinear =
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const blueLinear =
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return [
    gammaEncodeSrgb(redLinear),
    gammaEncodeSrgb(greenLinear),
    gammaEncodeSrgb(blueLinear),
  ];
}

function toRgbCssString(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): string {
  const r255 = Math.round(clamp(red, 0, 1) * 255);
  const g255 = Math.round(clamp(green, 0, 1) * 255);
  const b255 = Math.round(clamp(blue, 0, 1) * 255);
  if (alpha >= 1) {
    return `rgb(${r255}, ${g255}, ${b255})`;
  }
  return `rgba(${r255}, ${g255}, ${b255}, ${Number(alpha.toFixed(4))})`;
}

function parseOklToken(
  token: string,
): { lightness: number; a: number; b: number; alpha: number } | null {
  const match = token.trim().match(/^okl(ch|ab)\((.*)\)$/i);
  if (!match) return null;
  const type = match[1]?.toLowerCase();
  const inner = match[2] ?? "";
  if (!type || !inner.trim()) return null;

  const { channelsPart, alphaPart } = splitFunctionBodyAndAlpha(inner);
  const alpha = parseAlpha(alphaPart);
  if (alpha === null) return null;
  const tokens = channelsPart.split(/\s+/).filter(Boolean);
  if (tokens.length !== 3) return null;

  const lightness = parseLightness(tokens[0]);
  if (lightness === null) return null;

  if (type === "ab") {
    const axisA = parseOklabAxis(tokens[1]);
    const axisB = parseOklabAxis(tokens[2]);
    if (axisA === null || axisB === null) return null;
    return {
      lightness,
      a: axisA,
      b: axisB,
      alpha,
    };
  }

  const chroma = parseChroma(tokens[1]);
  const hue = parseHueDegrees(tokens[2]);
  if (chroma === null || hue === null) return null;
  const hueRadians = (hue * Math.PI) / 180;
  return {
    lightness,
    a: chroma * Math.cos(hueRadians),
    b: chroma * Math.sin(hueRadians),
    alpha,
  };
}

function getOklColorResolverElement(): HTMLSpanElement | null {
  if (typeof document === "undefined") return null;
  if (oklColorResolverElement?.isConnected) {
    return oklColorResolverElement;
  }
  const host = document.body || document.documentElement;
  if (!host) return null;
  const resolver = document.createElement("span");
  resolver.setAttribute(UI_MARKER_ATTR, "true");
  resolver.setAttribute("aria-hidden", "true");
  resolver.style.position = "fixed";
  resolver.style.left = "-99999px";
  resolver.style.top = "-99999px";
  resolver.style.width = "0";
  resolver.style.height = "0";
  resolver.style.pointerEvents = "none";
  resolver.style.opacity = "0";
  host.appendChild(resolver);
  oklColorResolverElement = resolver;
  return resolver;
}

function resolveOklTokenWithBrowser(token: string): string | null {
  const cached = OKL_TOKEN_CACHE.get(token);
  if (cached) return cached;

  const resolver = getOklColorResolverElement();
  if (!resolver) return null;

  resolver.style.color = "";
  resolver.style.color = token;
  if (!resolver.style.color) {
    return null;
  }

  const resolved = window.getComputedStyle(resolver).color;
  if (!resolved || hasUnsupportedColorFunction(resolved)) {
    return null;
  }
  OKL_TOKEN_CACHE.set(token, resolved);
  return resolved;
}

function normalizeOklColorToken(token: string): string {
  const browserResolved = resolveOklTokenWithBrowser(token);
  if (browserResolved) return browserResolved;

  const parsed = parseOklToken(token);
  if (!parsed) return token;
  const [red, green, blue] = oklabToSrgb(parsed.lightness, parsed.a, parsed.b);
  const fallback = toRgbCssString(red, green, blue, parsed.alpha);
  OKL_TOKEN_CACHE.set(token, fallback);
  return fallback;
}

function normalizeOklColorsInValue(value: string): string {
  return value.replace(OKLCH_LIKE_TOKEN_PATTERN, (token) =>
    normalizeOklColorToken(token),
  );
}

function applyCaptureSafeComputedStyles(clonedDocument: Document): void {
  if (!document.body || !clonedDocument.body) return;

  const sourceNodes: HTMLElement[] = [
    document.documentElement as HTMLElement,
    document.body,
    ...Array.from(document.body.querySelectorAll<HTMLElement>("*")),
  ];
  const clonedNodes: HTMLElement[] = [
    clonedDocument.documentElement as HTMLElement,
    clonedDocument.body,
    ...Array.from(clonedDocument.body.querySelectorAll<HTMLElement>("*")),
  ];

  const total = Math.min(sourceNodes.length, clonedNodes.length);
  for (let i = 0; i < total; i += 1) {
    const source = sourceNodes[i];
    const target = clonedNodes[i];
    const computed = window.getComputedStyle(source);

    for (const property of CAPTURE_COLOR_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (!value) continue;
      const nextValue = hasUnsupportedColorFunction(value)
        ? normalizeOklColorsInValue(value)
        : value;
      target.style.setProperty(property, nextValue);
    }

    for (let index = 0; index < computed.length; index += 1) {
      const property = computed.item(index);
      if (!property) continue;
      if (property.startsWith("--")) continue;
      const value = computed.getPropertyValue(property);
      if (!value || !hasUnsupportedColorFunction(value)) continue;
      const nextValue = normalizeOklColorsInValue(value);
      if (nextValue === value) continue;
      const priority = computed.getPropertyPriority(property);
      target.style.setProperty(property, nextValue, priority);
    }
  }
}

function getViewportCrop(
  scale: number,
  sourceWidth: number,
  sourceHeight: number,
): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
} {
  const requestedWidth = Math.max(1, Math.round(window.innerWidth * scale));
  const requestedHeight = Math.max(1, Math.round(window.innerHeight * scale));
  const sx = Math.max(0, Math.round(window.scrollX * scale));
  const sy = Math.max(0, Math.round(window.scrollY * scale));
  const sw = Math.max(1, Math.min(requestedWidth, sourceWidth - sx));
  const sh = Math.max(1, Math.min(requestedHeight, sourceHeight - sy));
  return {
    sx,
    sy,
    sw,
    sh,
  };
}

function cropCanvas(
  source: HTMLCanvasElement,
  crop: { sx: number; sy: number; sw: number; sh: number },
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = crop.sw;
  canvas.height = crop.sh;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create 2D context for viewport crop.");
  }
  context.drawImage(
    source,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    crop.sw,
    crop.sh,
  );
  return canvas;
}

function cropElementFromViewportCanvas(
  viewportCanvas: HTMLCanvasElement,
  rect: DOMRect,
  scale: number,
  paddingPx = 0,
): HTMLCanvasElement {
  const safePadding = Math.max(0, paddingPx);
  const sx = Math.max(0, Math.floor((rect.left - safePadding) * scale));
  const sy = Math.max(0, Math.floor((rect.top - safePadding) * scale));
  const requestedWidth = Math.max(1, Math.ceil((rect.width + safePadding * 2) * scale));
  const requestedHeight = Math.max(1, Math.ceil((rect.height + safePadding * 2) * scale));
  const sw = Math.max(1, Math.min(requestedWidth, viewportCanvas.width - sx));
  const sh = Math.max(1, Math.min(requestedHeight, viewportCanvas.height - sy));
  return cropCanvas(viewportCanvas, { sx, sy, sw, sh });
}

async function renderWithHtml2Canvas(
  mode: CaptureMode,
  target: HTMLElement,
  scale: number,
  ignoreElements: (element: Element) => boolean,
): Promise<HTMLCanvasElement> {
  const commonOptions: Html2CanvasOptions = {
    backgroundColor: null,
    logging: false,
    useCORS: true,
    scale,
    ignoreElements,
  };

  let options = commonOptions;
  if (mode === "viewport") {
    options = {
      ...commonOptions,
      width: window.innerWidth,
      height: window.innerHeight,
      x: window.scrollX,
      y: window.scrollY,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    };
  }

  if (mode === "fullpage") {
    const doc = document.documentElement;
    const width = Math.max(doc.scrollWidth, doc.clientWidth);
    const height = Math.max(doc.scrollHeight, doc.clientHeight);
    options = {
      ...commonOptions,
      width,
      height,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      windowWidth: width,
      windowHeight: height,
    };
  }

  const standardOptions: Html2CanvasOptions = {
    ...options,
    foreignObjectRendering: false,
  };
  const foreignObjectOptions: Html2CanvasOptions = {
    ...options,
    foreignObjectRendering: true,
  };
  const primaryOptions =
    mode === "element" ? standardOptions : foreignObjectOptions;
  const fallbackOptions =
    mode === "element" ? foreignObjectOptions : standardOptions;

  try {
    return await html2canvas(target, primaryOptions);
  } catch (primaryError) {
    try {
      return await html2canvas(target, fallbackOptions);
    } catch (fallbackError) {
      if (
        isUnsupportedColorFunctionError(primaryError) ||
        isUnsupportedColorFunctionError(fallbackError)
      ) {
        throw new Error(
          "Capture failed because unsupported color functions could not be normalized.",
        );
      }
      throw fallbackError;
    }
  }
}

async function renderWithHtmlToImageFallback(
  mode: CaptureMode,
  target: HTMLElement,
  scale: number,
): Promise<HTMLCanvasElement> {
  const filter = (node: HTMLElement): boolean => {
    if (!(node instanceof HTMLElement)) return true;
    return !isWidgetElement(node);
  };

  if (mode === "element") {
    return toCanvas(target, {
      cacheBust: true,
      pixelRatio: scale,
      filter,
      backgroundColor: "transparent",
    });
  }

  const doc = document.documentElement;
  const fullWidth = Math.max(doc.scrollWidth, doc.clientWidth);
  const fullHeight = Math.max(doc.scrollHeight, doc.clientHeight);
  const fullCanvas = await toCanvas(doc, {
    cacheBust: true,
    pixelRatio: scale,
    filter,
    backgroundColor: "transparent",
    width: fullWidth,
    height: fullHeight,
    canvasWidth: Math.max(1, Math.round(fullWidth * scale)),
    canvasHeight: Math.max(1, Math.round(fullHeight * scale)),
    style: {
      width: `${fullWidth}px`,
      height: `${fullHeight}px`,
    },
  });

  if (mode === "fullpage") {
    return fullCanvas;
  }

  const crop = getViewportCrop(scale, fullCanvas.width, fullCanvas.height);
  return cropCanvas(fullCanvas, crop);
}

export function ScreenshotterWidget({
  endpoint = "http://127.0.0.1:4783/api/captures",
  token = "",
  enabled,
  project = "app",
  elementPaddingPx = 8,
  captureSettleMs = 700,
  defaultMode = "element",
  themeSelectionDefault = "current",
  themeAdapter,
  onSaved,
  onError,
}: ScreenshotterWidgetProps) {
  const defaultEnabled =
    typeof process !== "undefined" ? process.env.NODE_ENV === "development" : false;
  const isEnabled = enabled ?? defaultEnabled;

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [mode, setMode] = useState<CaptureMode>(defaultMode);
  const [format, setFormat] = useState<CaptureFormat>("png");
  const [quality, setQuality] = useState<number>(90);
  const [elementPadding, setElementPadding] = useState<number>(() =>
    clamp(Math.round(elementPaddingPx), 0, 96),
  );
  const [themeSelection, setThemeSelection] =
    useState<ThemeSelection>(themeSelectionDefault);
  const [isPickingElement, setIsPickingElement] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<StatusState>({
    kind: "idle",
    message: "Ready",
  });
  const [hideUiForCapture, setHideUiForCapture] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);

  const canCaptureBothThemes = Boolean(themeAdapter);
  const scale = useMemo(() => clampQualityToScale(quality), [quality]);
  const safeElementPaddingPx = useMemo(
    () => clamp(Math.round(elementPadding), 0, 96),
    [elementPadding],
  );

  useEffect(() => {
    setElementPadding(clamp(Math.round(elementPaddingPx), 0, 96));
  }, [elementPaddingPx]);

  const getCurrentTheme = useCallback((): ThemeValue => {
    try {
      if (themeAdapter) return themeAdapter.getCurrentTheme();
    } catch {
      // fall back to DOM inference
    }
    return inferCurrentTheme();
  }, [themeAdapter]);

  const postCapture = useCallback(
    async (payload: CapturePayload): Promise<SaveResult> => {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (token) {
        headers["x-screenshotter-token"] = token;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as
        | SaveResult
        | { ok: false; error?: string }
        | null;

      if (!response.ok || !body || !("ok" in body) || !body.ok) {
        const message =
          body && "error" in body && body.error
            ? body.error
            : `Capture failed with status ${response.status}.`;
        throw new Error(message);
      }
      return body;
    },
    [endpoint, token],
  );

  const runSingleCapture = useCallback(
    async (theme: ThemeValue, selectedElement: HTMLElement | null): Promise<SaveResult> => {
      assertBrowser();
      setHideUiForCapture(true);
      await waitForPaint();
      await waitForVisualAssetsReady();

      try {
        const target = getDomCaptureTarget(mode, selectedElement);
        const ignoreElements = (element: Element): boolean =>
          element instanceof HTMLElement && isWidgetElement(element);
        let canvas: HTMLCanvasElement;
        if (mode === "element" && selectedElement) {
          const rect = selectedElement.getBoundingClientRect();
          try {
            const viewportCanvas = await renderWithHtml2Canvas(
              "viewport",
              document.documentElement,
              scale,
              ignoreElements,
            );
            canvas = cropElementFromViewportCanvas(
              viewportCanvas,
              rect,
              scale,
              safeElementPaddingPx,
            );
          } catch {
            try {
              const viewportCanvas = await renderWithHtmlToImageFallback(
                "viewport",
                document.documentElement,
                scale,
              );
              canvas = cropElementFromViewportCanvas(
                viewportCanvas,
                rect,
                scale,
                safeElementPaddingPx,
              );
            } catch {
              canvas = await renderWithHtml2Canvas(mode, target, scale, ignoreElements);
            }
          }
        } else {
          try {
            canvas = await renderWithHtml2Canvas(mode, target, scale, ignoreElements);
          } catch {
            canvas = await renderWithHtmlToImageFallback(mode, target, scale);
          }
        }
        const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
        const encoded = canvas.toDataURL(
          mimeType,
          format === "jpeg" ? quality / 100 : undefined,
        );
        if (typeof encoded !== "string" || !encoded) {
          throw new Error("Canvas encoder returned an empty image.");
        }
        const imageBase64 = encoded.includes(",") ? encoded.split(",")[1] : encoded;
        if (!imageBase64) {
          throw new Error("Failed to encode image.");
        }

        const now = new Date().toISOString();
        const payload: CapturePayload = {
          project,
          route: window.location.pathname || "/",
          mode,
          format,
          quality,
          scale,
          theme,
          selector: mode === "element" ? toSelector(selectedElement as HTMLElement) : undefined,
          selectorName:
            mode === "element" ? toSelectorName(selectedElement as HTMLElement) : undefined,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            dpr: window.devicePixelRatio || 1,
          },
          capturedAt: now,
          imageBase64,
        };

        return await postCapture(payload);
      } finally {
        setHideUiForCapture(false);
      }
    },
    [format, mode, postCapture, project, quality, safeElementPaddingPx, scale],
  );

  const executeCapture = useCallback(
    async (selectedElement: HTMLElement | null) => {
      if (isSaving) return;
      if (mode === "element" && !selectedElement) {
        setStatus({
          kind: "error",
          message: "Pick an element first.",
        });
        return;
      }
      if (themeSelection === "both" && !themeAdapter) {
        setStatus({
          kind: "error",
          message: "Theme adapter required for both-theme capture.",
        });
        return;
      }

      setIsSaving(true);
      setStatus({
        kind: "saving",
        message: "Capturing...",
      });

      let originalTheme: ThemeValue = "light";
      const results: SaveResult[] = [];

      try {
        originalTheme = getCurrentTheme();
        const captureThemes: ThemeValue[] =
          themeSelection === "both"
            ? [originalTheme, oppositeTheme(originalTheme)]
            : [originalTheme];
        for (const theme of captureThemes) {
          if (themeAdapter) {
            await themeAdapter.setTheme(theme);
            await waitForMs(120);
          }
          if (captureSettleMs > 0) {
            await waitForMs(captureSettleMs);
          }
          const result = await runSingleCapture(theme, selectedElement);
          results.push(result);
          onSaved?.(result);
        }
        const last = results[results.length - 1];
        setStatus({
          kind: "success",
          message:
            results.length === 1
              ? `Saved ${last.relativePath}`
              : `Saved ${results.length} files. Last: ${last.relativePath}`,
        });
      } catch (error) {
        const message = toFriendlyError(error);
        setStatus({
          kind: "error",
          message,
        });
        onError?.(message);
      } finally {
        if (themeAdapter) {
          try {
            await themeAdapter.setTheme(originalTheme);
          } catch {
            // ignore restoration failures in UI flow
          }
        }
        setIsSaving(false);
      }
    },
    [
      captureSettleMs,
      getCurrentTheme,
      isSaving,
      mode,
      onError,
      onSaved,
      runSingleCapture,
      themeAdapter,
      themeSelection,
    ],
  );

  useEffect(() => {
    if (!isEnabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      if (event.key.toLowerCase() !== "k") return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      setIsPanelOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isEnabled]);

  useEffect(() => {
    if (!isPickingElement) return;
    assertBrowser();

    const overlay = document.createElement("div");
    overlay.setAttribute(UI_MARKER_ATTR, "true");
    overlay.setAttribute("data-testid", "screenshotter-picker-overlay");
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "0";
    overlay.style.height = "0";
    overlay.style.border = "2px solid #00d2ff";
    overlay.style.background = "rgba(0, 210, 255, 0.1)";
    overlay.style.borderRadius = "8px";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "70";
    overlay.style.display = "none";

    const badge = document.createElement("div");
    badge.setAttribute(UI_MARKER_ATTR, "true");
    badge.style.position = "fixed";
    badge.style.left = "0";
    badge.style.top = "0";
    badge.style.padding = "5px 8px";
    badge.style.background = "rgba(3, 7, 18, 0.94)";
    badge.style.color = "#e5e7eb";
    badge.style.fontSize = "11px";
    badge.style.fontFamily = "'IBM Plex Mono', 'JetBrains Mono', monospace";
    badge.style.pointerEvents = "none";
    badge.style.border = "1px solid rgba(0, 210, 255, 0.45)";
    badge.style.borderRadius = "6px";
    badge.style.zIndex = "71";
    badge.style.display = "none";

    document.body.appendChild(overlay);
    document.body.appendChild(badge);
    let highlightedTarget: HTMLElement | null = null;

    const setTarget = (target: HTMLElement | null) => {
      if (!target || isWidgetElement(target)) {
        highlightedTarget = null;
        overlay.style.display = "none";
        badge.style.display = "none";
        return;
      }
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        highlightedTarget = null;
        overlay.style.display = "none";
        badge.style.display = "none";
        return;
      }
      highlightedTarget = target;
      overlay.style.display = "block";
      const paddedLeft = rect.left - safeElementPaddingPx;
      const paddedTop = rect.top - safeElementPaddingPx;
      const paddedWidth = rect.width + safeElementPaddingPx * 2;
      const paddedHeight = rect.height + safeElementPaddingPx * 2;
      overlay.style.left = `${paddedLeft}px`;
      overlay.style.top = `${paddedTop}px`;
      overlay.style.width = `${paddedWidth}px`;
      overlay.style.height = `${paddedHeight}px`;
      badge.style.display = "block";
      badge.style.left = `${Math.max(8, rect.left)}px`;
      badge.style.top = `${Math.max(8, rect.top - 30)}px`;
      badge.textContent = toSelectorName(target);
    };

    const onMouseMove = (event: MouseEvent) => {
      const pointerTarget =
        typeof document.elementFromPoint === "function"
          ? document.elementFromPoint(event.clientX, event.clientY)
          : null;
      const rawTarget =
        pointerTarget instanceof HTMLElement
          ? pointerTarget
          : event.target instanceof HTMLElement
            ? event.target
            : null;
      if (!rawTarget) {
        setTarget(null);
        return;
      }
      const target = resolveElementCaptureTarget(rawTarget);
      setTarget(target);
    };

    const onClick = (event: MouseEvent) => {
      const rawTarget = event.target instanceof HTMLElement ? event.target : null;
      let target: HTMLElement | null = null;
      if (highlightedTarget) {
        const rect = highlightedTarget.getBoundingClientRect();
        if (isPointInsideRect(event.clientX, event.clientY, rect)) {
          target = highlightedTarget;
        }
      }
      if (!target && rawTarget) {
        target = resolveElementCaptureTarget(rawTarget);
      }
      if (!target || isWidgetElement(target)) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget(null);
      setIsPickingElement(false);
      void executeCapture(target);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsPickingElement(false);
      setStatus({
        kind: "info",
        message: "Element picking canceled.",
      });
    };

    setStatus({
      kind: "info",
      message: "Click an element to capture.",
    });

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      badge.remove();
    };
  }, [executeCapture, isPickingElement, safeElementPaddingPx]);

  const actionLabel =
    mode === "element"
      ? isPickingElement
        ? "Picking..."
        : "Pick element"
      : isSaving
        ? "Capturing..."
        : "Capture now";

  const actionDisabled =
    isSaving || (mode === "element" ? isPickingElement : false) || (themeSelection === "both" && !canCaptureBothThemes);

  const statusStyle = {
    color: statusColor(status.kind),
    fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
    fontSize: "12px",
    lineHeight: "16px",
    margin: "0",
  } as const;

  if (!isEnabled) return null;

  return (
    <div
      ref={rootRef}
      data-screenshotter-ui="true"
      style={{
        position: "fixed",
        right: "calc(16px + env(safe-area-inset-right, 0px))",
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        zIndex: 60,
        opacity: hideUiForCapture ? 0 : 1,
        pointerEvents: hideUiForCapture ? "none" : "auto",
        transition: "opacity 120ms ease-out",
      }}
    >
      <button
        type="button"
        data-testid="screenshotter-launcher"
        aria-label="Toggle screenshot panel"
        onClick={() => setIsPanelOpen((value) => !value)}
        style={{
          width: "76px",
          height: "36px",
          borderRadius: "999px",
          border: "1px solid rgba(148, 163, 184, 0.45)",
          color: "#f8fafc",
          background: "linear-gradient(180deg, #111827 0%, #020617 100%)",
          cursor: "pointer",
          fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
          fontSize: "12px",
          fontWeight: 600,
          letterSpacing: "0.2px",
          boxShadow: "0 10px 24px rgba(2, 6, 23, 0.35)",
        }}
      >
        Shot
      </button>

      <section
        data-testid="screenshotter-panel"
        aria-hidden={!isPanelOpen}
        style={{
          position: "absolute",
          right: 0,
          bottom: "48px",
          width: "320px",
          maxWidth: "calc(100vw - 24px)",
          borderRadius: "16px",
          padding: "14px",
          border: "1px solid rgba(100, 116, 139, 0.4)",
          background:
            "linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(2, 6, 23, 0.98) 100%)",
          color: "#f8fafc",
          backdropFilter: "blur(10px)",
          boxShadow: "0 20px 40px rgba(2, 6, 23, 0.45)",
          transform: isPanelOpen ? "translateY(0)" : "translateY(10px)",
          opacity: isPanelOpen ? 1 : 0,
          pointerEvents: isPanelOpen ? "auto" : "none",
          transition: "transform 180ms ease-out, opacity 180ms ease-out",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          }}
        >
          <strong
            style={{
              fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
              fontSize: "13px",
              color: "#e2e8f0",
            }}
          >
            Screenshotter
          </strong>
          <span
            style={{
              fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
              fontSize: "11px",
              color: "#94a3b8",
            }}
          >
            Cmd/Ctrl + Shift + K
          </span>
        </div>

        <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
          {(["element", "viewport", "fullpage"] as CaptureMode[]).map((value) => (
            <button
              key={value}
              type="button"
              data-testid={`mode-${value}`}
              aria-label={`Switch to ${value} mode`}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              style={{
                flex: 1,
                height: "30px",
                borderRadius: "8px",
                border:
                  mode === value
                    ? "1px solid rgba(34, 211, 238, 0.9)"
                    : "1px solid rgba(100, 116, 139, 0.45)",
                background:
                  mode === value ? "rgba(6, 182, 212, 0.18)" : "rgba(15, 23, 42, 0.7)",
                color: mode === value ? "#e0f2fe" : "#cbd5e1",
                fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              {value}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
          {(["png", "jpeg"] as CaptureFormat[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Use ${value.toUpperCase()} format`}
              aria-pressed={format === value}
              onClick={() => setFormat(value)}
              style={{
                flex: 1,
                height: "30px",
                borderRadius: "8px",
                border:
                  format === value
                    ? "1px solid rgba(56, 189, 248, 0.9)"
                    : "1px solid rgba(100, 116, 139, 0.45)",
                background:
                  format === value ? "rgba(56, 189, 248, 0.2)" : "rgba(15, 23, 42, 0.7)",
                color: format === value ? "#e0f2fe" : "#cbd5e1",
                fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>

        <label
          style={{
            display: "block",
            marginBottom: "10px",
            fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
            fontSize: "11px",
            color: "#cbd5e1",
          }}
        >
          Quality
          <span style={{ float: "right", color: "#e2e8f0" }}>
            {quality} ({scale.toFixed(2)}x)
          </span>
          <input
            aria-label="Capture quality"
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(event) => setQuality(Number(event.currentTarget.value))}
            style={{ width: "100%", marginTop: "6px" }}
          />
        </label>

        {mode === "element" ? (
          <label
            style={{
              display: "block",
              marginBottom: "10px",
              fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
              fontSize: "11px",
              color: "#cbd5e1",
            }}
          >
            Element padding
            <span style={{ float: "right", color: "#e2e8f0" }}>
              {safeElementPaddingPx}px
            </span>
            <input
              aria-label="Element padding"
              data-testid="element-padding"
              type="range"
              min={0}
              max={32}
              step={1}
              value={safeElementPaddingPx}
              onChange={(event) => setElementPadding(Number(event.currentTarget.value))}
              style={{ width: "100%", marginTop: "6px" }}
            />
          </label>
        ) : null}

        <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
          {(["current", "both"] as ThemeSelection[]).map((value) => {
            const disabled = value === "both" && !canCaptureBothThemes;
            const active = themeSelection === value;
            return (
              <button
                key={value}
                type="button"
                aria-label={`Set theme capture to ${value}`}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => setThemeSelection(value)}
                style={{
                  flex: 1,
                  height: "30px",
                  borderRadius: "8px",
                  border: active
                    ? "1px solid rgba(34, 211, 238, 0.9)"
                    : "1px solid rgba(100, 116, 139, 0.45)",
                  background: active
                    ? "rgba(34, 211, 238, 0.15)"
                    : "rgba(15, 23, 42, 0.7)",
                  color: active ? "#e0f2fe" : "#cbd5e1",
                  opacity: disabled ? 0.45 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                  fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
                  fontSize: "11px",
                }}
              >
                {value}
              </button>
            );
          })}
        </div>

        {!canCaptureBothThemes ? (
          <p
            style={{
              margin: "0 0 10px",
              color: "#93c5fd",
              fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
              fontSize: "11px",
              lineHeight: "15px",
            }}
          >
            Provide `themeAdapter` to enable both-theme capture.
          </p>
        ) : null}

        <button
          type="button"
          data-testid="action-button"
          aria-label={mode === "element" ? "Pick element to capture" : "Capture screenshot"}
          disabled={actionDisabled}
          onClick={() => {
            if (mode === "element") {
              setMode("element");
              setIsPickingElement(true);
              return;
            }
            void executeCapture(null);
          }}
          style={{
            width: "100%",
            height: "36px",
            borderRadius: "10px",
            border: "1px solid rgba(34, 211, 238, 0.75)",
            background: actionDisabled
              ? "rgba(30, 41, 59, 0.6)"
              : "linear-gradient(180deg, #0891b2 0%, #0e7490 100%)",
            color: actionDisabled ? "#94a3b8" : "#f0fdfa",
            cursor: actionDisabled ? "not-allowed" : "pointer",
            fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          {actionLabel}
        </button>

        <p style={{ ...statusStyle, marginTop: "9px" }}>{status.message}</p>
      </section>
    </div>
  );
}

export default ScreenshotterWidget;
