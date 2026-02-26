import type { ScreenshotterWidgetProps } from "./ScreenshotterWidget.js";

export type ScreenshotterConfig = ScreenshotterWidgetProps;

export function defineScreenshotterConfig(
  config: ScreenshotterConfig,
): ScreenshotterConfig {
  return config;
}
