"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
const THEME_STORAGE_KEYS = [
  "vite-ui-theme",
  "theme",
  "next-theme",
  "next-themes-theme",
] as const;
const CAPTURE_MODE_OPTIONS: readonly CaptureMode[] = [
  "element",
  "viewport",
  "fullpage",
];
const FORMAT_OPTIONS: readonly CaptureFormat[] = ["png", "jpeg"];
const THEME_OPTIONS: readonly ThemeSelection[] = ["current", "both"];
const STATUS_HIDE_DELAY_MS = 2600;

const WIDGET_PANEL_CSS = `
.ssw-root,
.ssw-root * {
  box-sizing: border-box;
}
.ssw-root {
  --ui-bg: 0 0% 99%;
  --ui-panel: 0 0% 100%;
  --ui-panel-2: 0 0% 97%;
  --ui-border: 0 0% 86%;
  --ui-border-strong: 0 0% 80%;
  --ui-fg: 0 0% 10%;
  --ui-muted: 0 0% 38%;
  --ui-accent: 196 100% 42%;
  --ui-accent-hover: 196 100% 38%;
  --ui-accent-pressed: 196 100% 35%;
  --ui-accent-fg: 0 0% 100%;
  --ui-ring: 196 100% 42%;
  --ui-radius: 12px;
  --ui-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  --ssw-font-ui: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
  --ssw-font-mono: "IBM Plex Mono", "JetBrains Mono", monospace;
  color: hsl(var(--ui-fg));
  font-family: var(--ssw-font-ui);
}
.ssw-root[data-ui-theme="dark"] {
  --ui-bg: 0 0% 3.5%;
  --ui-panel: 0 0% 6.5%;
  --ui-panel-2: 0 0% 9%;
  --ui-border: 0 0% 14%;
  --ui-border-strong: 0 0% 18%;
  --ui-fg: 0 0% 96%;
  --ui-muted: 0 0% 72%;
  --ui-accent: 196 100% 50%;
  --ui-accent-hover: 196 100% 54%;
  --ui-accent-pressed: 196 100% 46%;
  --ui-accent-fg: 0 0% 6%;
  --ui-ring: 196 100% 55%;
  --ui-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}

.ui-focus {
  transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
}
.ui-focus:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px hsl(var(--ui-ring)), 0 0 0 4px hsl(var(--ui-panel));
}

.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  border-radius: var(--ui-radius);
  padding: 0 16px;
  font-family: var(--ssw-font-ui);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: transform 150ms ease-out, background-color 150ms ease-out,
    border-color 150ms ease-out, color 150ms ease-out, box-shadow 150ms ease-out,
    filter 150ms ease-out;
}
.ui-btn:active {
  transform: translateY(1px);
}
.ui-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.ui-btn-primary {
  border: 1px solid hsl(var(--ui-border-strong));
  background: hsl(var(--ui-accent));
  color: hsl(var(--ui-accent-fg));
  box-shadow: 0 6px 14px rgba(2, 6, 23, 0.2);
}
.ui-btn-primary:hover:not(:disabled) {
  background: hsl(var(--ui-accent-hover));
}
.ui-btn-primary:active:not(:disabled) {
  background: hsl(var(--ui-accent-pressed));
}

.ui-btn-outline {
  border: 1px solid hsl(var(--ui-border));
  background: hsl(var(--ui-panel-2) / 0.35);
  color: hsl(var(--ui-fg));
}
.ui-btn-outline:hover:not(:disabled) {
  background: hsl(var(--ui-panel-2) / 0.5);
  border-color: hsl(var(--ui-border) / 0.82);
}

.ui-btn-ghost {
  border: 1px solid transparent;
  background: transparent;
  color: hsl(var(--ui-fg));
}
.ui-btn-ghost:hover:not(:disabled) {
  background: hsl(var(--ui-panel-2) / 0.4);
}

.ui-btn-lg {
  height: 40px;
  padding: 0 18px;
  font-size: 14px;
}

.ui-panel {
  border: 1px solid hsl(var(--ui-border));
  background: linear-gradient(
    180deg,
    hsl(var(--ui-panel) / 0.95) 0%,
    hsl(var(--ui-bg) / 0.93) 100%
  );
  box-shadow: var(--ui-shadow);
  border-radius: 18px;
  backdrop-filter: blur(8px);
}

.ui-divider {
  border-top: 1px solid hsl(var(--ui-border) / 0.7);
}

.ui-seg-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.ssw-output-row {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.ui-toggle-group {
  border: 1px solid hsl(var(--ui-border));
  border-radius: 16px;
  padding: 4px;
  background: hsl(var(--ui-panel-2) / 0.2);
}
.ui-seg-item {
  height: 44px;
  border-radius: 12px;
  border: 1px solid hsl(var(--ui-border) / 0.72);
  background: hsl(var(--ui-panel-2) / 0.22);
  color: hsl(var(--ui-muted));
}
.ui-seg-item[data-active="true"] {
  border-color: hsl(var(--ui-accent));
  background: hsl(var(--ui-panel-2) / 0.62);
  color: hsl(var(--ui-fg));
  box-shadow:
    0 0 0 1px hsl(var(--ui-accent) / 0.58),
    inset 0 0 0 1px hsl(var(--ui-accent) / 0.24),
    inset 0 1px 0 hsl(0 0% 100% / 0.05);
}
.ui-seg-item[data-active="true"]:hover:not(:disabled) {
  background: hsl(var(--ui-panel-2) / 0.7);
}
.ui-seg-item:disabled {
  color: hsl(var(--ui-muted) / 0.5);
  border-color: hsl(var(--ui-border) / 0.3);
  background: hsl(var(--ui-panel-2) / 0.1);
  cursor: not-allowed;
}

.ui-range {
  display: flex;
  align-items: center;
  width: 100%;
  height: 36px;
}
.ui-range input[type="range"] {
  --pct: 0%;
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    hsl(var(--ui-accent)) 0%,
    hsl(var(--ui-accent)) var(--pct),
    hsl(var(--ui-border)) var(--pct),
    hsl(var(--ui-border)) 100%
  );
  outline: none;
  transition: background-color 150ms ease-out;
}
.ui-range input[type="range"]::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    hsl(var(--ui-accent)) 0%,
    hsl(var(--ui-accent)) var(--pct),
    hsl(var(--ui-border)) var(--pct),
    hsl(var(--ui-border)) 100%
  );
}
.ui-range input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  margin-top: -7px;
  border-radius: 999px;
  background: hsl(var(--ui-accent));
  border: 2px solid hsl(var(--ui-panel));
  box-shadow: 0 0 0 4px hsl(var(--ui-ring) / 0);
  transition: transform 150ms ease-out, box-shadow 150ms ease-out, filter 150ms ease-out;
}
.ui-range input[type="range"]:hover::-webkit-slider-thumb {
  filter: brightness(1.08);
}
.ui-range input[type="range"]:active::-webkit-slider-thumb {
  transform: scale(0.98);
}
.ui-range input[type="range"]:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 4px hsl(var(--ui-ring) / 0.35);
}
.ui-range input[type="range"]::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: hsl(var(--ui-accent));
  border: 2px solid hsl(var(--ui-panel));
  box-shadow: 0 0 0 4px hsl(var(--ui-ring) / 0);
  transition: transform 150ms ease-out, box-shadow 150ms ease-out, filter 150ms ease-out;
}
.ui-range input[type="range"]:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 4px hsl(var(--ui-ring) / 0.35);
}
.ui-range input[type="range"]::-moz-range-progress {
  height: 4px;
  border-radius: 999px;
  background: hsl(var(--ui-accent));
}
.ui-range input[type="range"]::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: hsl(var(--ui-border));
}

.ssw-launcher {
  width: 68px;
  height: 32px;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
}
.ssw-panel {
  position: absolute;
  right: 0;
  bottom: 46px;
  width: 328px;
  max-width: calc(100vw - 24px);
  transform: translateY(8px);
  opacity: 0;
  pointer-events: none;
  transition: transform 140ms ease-out, opacity 140ms ease-out;
}
.ssw-panel[data-open="true"] {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}

.ssw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 12px 10px;
  border-bottom: 1px solid hsl(var(--ui-border));
}
.ssw-title {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
}
.ssw-subtitle {
  margin: 2px 0 0;
  font-size: 10px;
  line-height: 1.3;
  color: hsl(var(--ui-muted));
}
.ssw-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ssw-hotkey {
  padding: 2px 7px;
  border: 1px solid hsl(var(--ui-border));
  border-radius: 999px;
  font-family: var(--ssw-font-mono);
  font-size: 10px;
  color: hsl(var(--ui-muted));
}
.ssw-icon-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 10px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.ssw-body {
  padding: 12px;
}
.ssw-group {
  margin-bottom: 12px;
}
.ssw-group-title {
  margin: 0 0 6px;
  font-size: 10px;
  font-weight: 600;
  color: hsl(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.ssw-advanced-card {
  margin-bottom: 10px;
  border: 1px solid hsl(var(--ui-border));
  border-radius: 14px;
  background: hsl(var(--ui-panel-2) / 0.2);
  overflow: hidden;
}
.ssw-advanced-toggle {
  width: 100%;
  height: 36px;
  justify-content: space-between;
  padding: 0 12px;
}
.ssw-advanced-card[data-open="true"] .ssw-advanced-toggle {
  border-bottom: 1px solid hsl(var(--ui-border) / 0.7);
}
.ssw-advanced-toggle:hover {
  background: hsl(var(--ui-panel-2) / 0.22);
}
.ssw-chevron {
  display: inline-block;
  transition: transform 150ms ease-out;
}
.ssw-chevron.is-open {
  transform: rotate(180deg);
}
.ssw-advanced-body {
  padding: 9px;
}

.ssw-setting {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(118px, 132px);
  gap: 10px;
  align-items: center;
  padding: 7px 0;
}
.ssw-setting + .ssw-setting {
  border-top: 1px solid hsl(var(--ui-border) / 0.7);
}
.ssw-setting-label {
  margin: 0;
  font-size: 12px;
  font-weight: 550;
  line-height: 1.2;
}
.ssw-setting-help {
  margin: 2px 0 0;
  font-size: 10px;
  line-height: 1.25;
  color: hsl(var(--ui-muted));
}
.ssw-setting-value {
  display: block;
  margin-bottom: 4px;
  text-align: right;
  font-family: var(--ssw-font-mono);
  font-size: 10px;
}
.ssw-mini-segment {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.ssw-mini-segment .ui-seg-item {
  height: 34px;
}

.ssw-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}
.ssw-status-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid hsl(var(--ui-border));
  border-radius: 999px;
  padding: 5px 9px;
  font-family: var(--ssw-font-mono);
  font-size: 10px;
  color: hsl(var(--ui-muted));
  background: hsl(var(--ui-panel-2) / 0.22);
}
.ssw-status-chip[data-kind="idle"] {
  border-color: hsl(var(--ui-border) / 0.65);
  color: hsl(var(--ui-muted));
}
.ssw-status-chip[data-kind="success"] {
  border-color: hsl(142 70% 35% / 0.65);
  background: hsl(142 70% 20% / 0.25);
  color: hsl(142 70% 75%);
}
.ssw-root[data-ui-theme="light"] .ssw-status-chip[data-kind="success"] {
  border-color: hsl(145 46% 45%);
  background: hsl(145 68% 90%);
  color: hsl(145 76% 18%);
}
.ssw-status-chip[data-kind="error"] {
  border-color: hsl(350 82% 45% / 0.55);
  background: hsl(350 82% 20% / 0.24);
  color: hsl(350 95% 83%);
}
.ssw-status-chip[data-kind="info"] {
  border-color: hsl(206 95% 58% / 0.58);
  background: hsl(206 95% 32% / 0.22);
  color: hsl(206 95% 84%);
}
.ssw-action-btn {
  width: calc((100% - 8px) / 2);
  min-width: 0;
  height: 44px;
  font-size: 13px;
}
.ssw-toast {
  margin: 6px 2px 0;
  font-family: var(--ssw-font-mono);
  font-size: 11px;
  line-height: 16px;
  color: hsl(var(--ui-muted));
  opacity: 1;
  transform: translateY(0);
  pointer-events: none;
}
.ssw-toast[data-kind="success"] {
  color: hsl(142 70% 76%);
}
.ssw-root[data-ui-theme="light"] .ssw-toast[data-kind="success"] {
  color: hsl(145 72% 22%);
}
.ssw-toast[data-kind="error"] {
  color: hsl(350 95% 83%);
}
.ssw-toast[data-kind="info"] {
  color: hsl(206 95% 84%);
}

@media (max-width: 520px) {
  .ssw-panel {
    width: min(328px, calc(100vw - 18px));
  }
  .ssw-subtitle {
    display: none;
  }
}
@media (max-width: 760px) {
  .ssw-hotkey {
    display: none;
  }
}
`;

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

function parseStoredThemeValue(raw: string | null): ThemeValue | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase().replace(/^['"]|['"]$/g, "");
  if (!normalized || normalized === "system") return null;
  if (normalized === "dark" || normalized.endsWith(":dark") || normalized.endsWith("-dark")) {
    return "dark";
  }
  if (normalized === "light" || normalized.endsWith(":light") || normalized.endsWith("-light")) {
    return "light";
  }
  if (normalized.includes("dark")) return "dark";
  if (normalized.includes("light")) return "light";
  return null;
}

function getStorageTheme(): ThemeValue | null {
  if (typeof window === "undefined") return null;
  for (const key of THEME_STORAGE_KEYS) {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      raw = null;
    }
    const parsed = parseStoredThemeValue(raw);
    if (parsed) return parsed;
  }
  return null;
}

function resolveWidgetTheme(): ThemeValue {
  return getStorageTheme() ?? inferCurrentTheme();
}

function oppositeTheme(theme: ThemeValue): ThemeValue {
  return theme === "light" ? "dark" : "light";
}

function modeLabel(mode: CaptureMode): string {
  if (mode === "element") return "Element";
  if (mode === "viewport") return "Viewport";
  return "Full page";
}

function actionLabel(mode: CaptureMode, isPickingElement: boolean, isSaving: boolean): string {
  if (mode === "element") {
    return isPickingElement ? "Picking..." : "Pick element";
  }
  if (mode === "viewport") {
    return isSaving ? "Capturing..." : "Capture viewport";
  }
  return isSaving ? "Capturing..." : "Capture full page";
}

function statusChipLabel(kind: StatusState["kind"]): string {
  if (kind === "saving") return "Capturing...";
  if (kind === "success") return "Saved";
  if (kind === "error") return "Error";
  if (kind === "info") return "Picking...";
  return "Ready";
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

function normalizeElementPadding(value: number): number {
  return clamp(Math.round(value), 0, 96);
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  const message = toFriendlyError(error).toLowerCase();
  return message.includes("abort");
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
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [mode, setMode] = useState<CaptureMode>(defaultMode);
  const [format, setFormat] = useState<CaptureFormat>("png");
  const [quality, setQuality] = useState<number>(90);
  const [elementPadding, setElementPadding] = useState<number>(() =>
    normalizeElementPadding(elementPaddingPx),
  );
  const [themeSelection, setThemeSelection] =
    useState<ThemeSelection>(themeSelectionDefault);
  const [isPickingElement, setIsPickingElement] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<StatusState>({
    kind: "idle",
    message: "Ready",
  });
  const [isStatusToastVisible, setIsStatusToastVisible] = useState(false);
  const [hideUiForCapture, setHideUiForCapture] = useState(false);
  const [uiTheme, setUiTheme] = useState<ThemeValue>(() =>
    typeof window !== "undefined" ? resolveWidgetTheme() : "dark",
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);
  const isCaptureInFlightRef = useRef(false);
  const pendingRequestControllersRef = useRef<Set<AbortController>>(new Set());

  const canCaptureBothThemes = Boolean(themeAdapter);
  const scale = useMemo(() => clampQualityToScale(quality), [quality]);
  const safeElementPaddingPx = useMemo(
    () => normalizeElementPadding(elementPadding),
    [elementPadding],
  );

  const runIfMounted = useCallback((work: () => void) => {
    if (!isMountedRef.current) return;
    work();
  }, []);

  useEffect(() => {
    setElementPadding(normalizeElementPadding(elementPaddingPx));
  }, [elementPaddingPx]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isCaptureInFlightRef.current = false;
      for (const controller of pendingRequestControllersRef.current) {
        controller.abort();
      }
      pendingRequestControllersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!isEnabled || typeof window === "undefined") return undefined;

    const syncTheme = () => {
      setUiTheme(resolveWidgetTheme());
    };

    syncTheme();
    window.addEventListener("storage", syncTheme);

    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      syncTheme();
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-mode"],
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const legacyMedia = media as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    const onMediaChange = () => {
      if (!getStorageTheme()) {
        syncTheme();
      }
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onMediaChange);
    } else {
      legacyMedia.addListener?.(onMediaChange);
    }

    return () => {
      window.removeEventListener("storage", syncTheme);
      observer.disconnect();
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", onMediaChange);
      } else {
        legacyMedia.removeListener?.(onMediaChange);
      }
    };
  }, [isEnabled]);

  useEffect(() => {
    if (!canCaptureBothThemes && themeSelection === "both") {
      setThemeSelection("current");
    }
  }, [canCaptureBothThemes, themeSelection]);

  useEffect(() => {
    if (status.kind === "idle") {
      setIsStatusToastVisible(false);
      return undefined;
    }
    setIsStatusToastVisible(true);
    if (status.kind === "success" || status.kind === "info") {
      const timeout = window.setTimeout(() => {
        setIsStatusToastVisible(false);
      }, STATUS_HIDE_DELAY_MS);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [status.kind, status.message]);

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

      const controller = new AbortController();
      pendingRequestControllersRef.current.add(controller);
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        pendingRequestControllersRef.current.delete(controller);
      }

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
      runIfMounted(() => setHideUiForCapture(true));
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
        const elementTarget = mode === "element" ? selectedElement : null;
        const payload: CapturePayload = {
          project,
          route: window.location.pathname || "/",
          mode,
          format,
          quality,
          scale,
          theme,
          selector: elementTarget ? toSelector(elementTarget) : undefined,
          selectorName: elementTarget ? toSelectorName(elementTarget) : undefined,
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
        runIfMounted(() => setHideUiForCapture(false));
      }
    },
    [format, mode, postCapture, project, quality, runIfMounted, safeElementPaddingPx, scale],
  );

  const executeCapture = useCallback(
    async (selectedElement: HTMLElement | null) => {
      if (isCaptureInFlightRef.current) return;
      if (mode === "element" && !selectedElement) {
        runIfMounted(() =>
          setStatus({
            kind: "error",
            message: "Pick an element first.",
          }),
        );
        return;
      }
      if (themeSelection === "both" && !themeAdapter) {
        runIfMounted(() =>
          setStatus({
            kind: "error",
            message: "Theme adapter required for both-theme capture.",
          }),
        );
        return;
      }

      isCaptureInFlightRef.current = true;
      runIfMounted(() => {
        setIsSaving(true);
        setStatus({
          kind: "saving",
          message: "Capturing...",
        });
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
        runIfMounted(() =>
          setStatus({
            kind: "success",
            message:
              results.length === 1
                ? `Saved ${last.relativePath}`
                : `Saved ${results.length} files. Last: ${last.relativePath}`,
          }),
        );
      } catch (error) {
        if (isAbortError(error)) return;
        const message = toFriendlyError(error);
        runIfMounted(() =>
          setStatus({
            kind: "error",
            message,
          }),
        );
        onError?.(message);
      } finally {
        if (themeAdapter) {
          try {
            await themeAdapter.setTheme(originalTheme);
          } catch {
            // ignore restoration failures in UI flow
          }
        }
        isCaptureInFlightRef.current = false;
        runIfMounted(() => setIsSaving(false));
      }
    },
    [
      captureSettleMs,
      getCurrentTheme,
      mode,
      onError,
      onSaved,
      runIfMounted,
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

  const currentActionLabel = actionLabel(mode, isPickingElement, isSaving);

  const actionDisabled =
    isSaving ||
    (mode === "element" ? isPickingElement : false) ||
    (themeSelection === "both" && !canCaptureBothThemes);
  const currentStatusChipLabel = statusChipLabel(status.kind);
  const qualityPct = useMemo(() => ((quality - 1) / 99) * 100, [quality]);
  const paddingPct = useMemo(() => (safeElementPaddingPx / 32) * 100, [safeElementPaddingPx]);

  if (!isEnabled) return null;

  return (
    <div
      ref={rootRef}
      data-screenshotter-ui="true"
      data-ui-theme={uiTheme}
      className="ssw-root"
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
      <style data-screenshotter-ui="true">{WIDGET_PANEL_CSS}</style>
      <button
        type="button"
        data-testid="screenshotter-launcher"
        aria-label="Toggle screenshot panel"
        className="ui-btn ui-btn-outline ui-focus ssw-launcher"
        onClick={() => setIsPanelOpen((value) => !value)}
      >
        Shot
      </button>

      <section
        data-testid="screenshotter-panel"
        aria-hidden={!isPanelOpen}
        className="ui-panel ssw-panel"
        data-open={isPanelOpen ? "true" : "false"}
      >
        <div className="ssw-header">
          <div>
            <h3 className="ssw-title">Screenshotter</h3>
            <p className="ssw-subtitle">Only what matters</p>
          </div>
          <div className="ssw-header-actions">
            <span className="ssw-hotkey">Cmd/Ctrl + Shift + K</span>
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-focus ssw-icon-btn"
              aria-label="Close screenshot panel"
              onClick={() => setIsPanelOpen(false)}
            >
              ×
            </button>
          </div>
        </div>

        <div className="ssw-body">
          <div className="ssw-group">
            <p className="ssw-group-title">Capture</p>
            <div className="ui-toggle-group">
              <div className="ui-seg-row">
                {CAPTURE_MODE_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-testid={`mode-${value}`}
                    aria-label={`Switch to ${modeLabel(value)} mode`}
                    aria-pressed={mode === value}
                    data-active={mode === value ? "true" : "false"}
                    className="ui-btn ui-btn-outline ui-focus ui-seg-item"
                    onClick={() => setMode(value)}
                  >
                    {modeLabel(value)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ssw-group">
            <p className="ssw-group-title">Output</p>
            <div className="ui-toggle-group">
              <div className="ui-seg-row ssw-output-row">
                {FORMAT_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Use ${value.toUpperCase()} format`}
                    aria-pressed={format === value}
                    data-active={format === value ? "true" : "false"}
                    className="ui-btn ui-btn-outline ui-focus ui-seg-item"
                    onClick={() => setFormat(value)}
                  >
                    {value.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ssw-advanced-card" data-open={isAdvancedOpen ? "true" : "false"}>
            <button
              type="button"
              aria-expanded={isAdvancedOpen}
              className="ui-btn ui-btn-ghost ui-focus ssw-advanced-toggle"
              onClick={() => setIsAdvancedOpen((open) => !open)}
            >
              <span>Advanced</span>
              <span className={`ssw-chevron${isAdvancedOpen ? " is-open" : ""}`}>▾</span>
            </button>

            {isAdvancedOpen ? (
              <div className="ssw-advanced-body">
                {format === "jpeg" ? (
                  <div className="ssw-setting">
                    <div>
                      <p className="ssw-setting-label">JPEG quality</p>
                      <p className="ssw-setting-help">JPEG only</p>
                    </div>
                    <div>
                      <span className="ssw-setting-value">{quality}%</span>
                      <div className="ui-range">
                        <input
                          aria-label="JPEG quality"
                          type="range"
                          min={1}
                          max={100}
                          value={quality}
                          style={{ "--pct": `${qualityPct}%` } as CSSProperties}
                          onChange={(event) => setQuality(Number(event.currentTarget.value))}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {mode === "element" ? (
                  <div className="ssw-setting">
                    <div>
                      <p className="ssw-setting-label">Padding</p>
                      <p className="ssw-setting-help">Element capture</p>
                    </div>
                    <div>
                      <span className="ssw-setting-value">{safeElementPaddingPx}px</span>
                      <div className="ui-range">
                        <input
                          aria-label="Element padding"
                          data-testid="element-padding"
                          type="range"
                          min={0}
                          max={32}
                          step={1}
                          value={safeElementPaddingPx}
                          style={{ "--pct": `${paddingPct}%` } as CSSProperties}
                          onChange={(event) => setElementPadding(Number(event.currentTarget.value))}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="ssw-setting">
                  <div>
                    <p className="ssw-setting-label">Theme</p>
                    <p className="ssw-setting-help">
                      {canCaptureBothThemes
                        ? "Current or both themes"
                        : "Dual-theme capture unavailable"}
                    </p>
                  </div>
                  <div className="ui-toggle-group">
                    <div className="ssw-mini-segment">
                      {THEME_OPTIONS.map((value) => {
                        const disabled = value === "both" && !canCaptureBothThemes;
                        const active = themeSelection === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-label={`Set theme capture to ${value}`}
                            aria-pressed={active}
                            data-active={active ? "true" : "false"}
                            className="ui-btn ui-btn-outline ui-focus ui-seg-item"
                            disabled={disabled}
                            onClick={() => setThemeSelection(value)}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="ssw-footer">
            <span className="ssw-status-chip" data-kind={status.kind}>
              {currentStatusChipLabel}
            </span>
            <button
              type="button"
              data-testid="action-button"
              aria-label={mode === "element" ? "Pick element to capture" : "Capture screenshot"}
              className="ui-btn ui-btn-primary ui-focus ssw-action-btn"
              disabled={actionDisabled}
              onClick={() => {
                if (mode === "element") {
                  setMode("element");
                  setIsPickingElement(true);
                  return;
                }
                void executeCapture(null);
              }}
            >
              {currentActionLabel}
            </button>
          </div>
          {isStatusToastVisible ? (
            <p className="ssw-toast" data-kind={status.kind}>
              {status.message}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default ScreenshotterWidget;
