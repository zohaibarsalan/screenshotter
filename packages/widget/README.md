# @screenshotter/widget

React screenshot widget for in-app capture workflows.

Supports element, viewport, and full-page captures with optional dual-theme capture.

## Install

```bash
pnpm add @screenshotter/widget
```

## Quick Start

```tsx
"use client";

import { ScreenshotterWidget } from "@screenshotter/widget";

export function DevScreenshotWidget() {
  return (
    <ScreenshotterWidget
      endpoint="http://127.0.0.1:4783/api/captures"
      project="my-app"
    />
  );
}
```

## Main Props

- `endpoint?: string` default `http://127.0.0.1:4783/api/captures`
- `project?: string` default `"app"`
- `enabled?: boolean` default `NODE_ENV === "development"`
- `defaultMode?: "element" | "viewport" | "fullpage"`
- `themeSelectionDefault?: "current" | "both"`
- `themeAdapter?: { getCurrentTheme; setTheme }` required for `"both"` capture
- `onSaved?: (result) => void`
- `onError?: (message) => void`

## Exports

- `ScreenshotterWidget`
- `type ScreenshotterWidgetProps`
- re-exported protocol types (`CapturePayload`, `SaveResult`, etc.)

## Repository

- Full setup docs: [screenshotter README](https://github.com/zohaibarsalan/screenshotter#readme)
- Issues: [GitHub Issues](https://github.com/zohaibarsalan/screenshotter/issues)

## License

ISC
