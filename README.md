# screenshotter

In-app screenshot capture for React applications.

`screenshotter` gives you a floating capture widget with element, viewport, and full-page modes.  
Current package behavior is download-only, so setup is lightweight: one package and one config file.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Install](#install)
- [Quick Start](#quick-start)
- [Usage Patterns](#usage-patterns)
- [Framework Guides](#framework-guides)
- [API](#api)
- [Configuration Reference](#configuration-reference)
- [Callbacks and Result Shape](#callbacks-and-result-shape)
- [Behavior Notes](#behavior-notes)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Features

- Floating launcher UI with keyboard shortcut (`Cmd/Ctrl + Shift + K`)
- Capture modes: `element`, `viewport`, `fullpage`
- Output formats: `png` and `jpeg`
- Adjustable quality and settle delay
- Optional dual-theme capture (`current` or `both`)
- Download-first workflow with no local server dependency

## Requirements

- React `^18` or `^19`
- React DOM `^18` or `^19`
- Browser environment (DOM + Canvas APIs)

## Install

```bash
pnpm add screenshotter
```

## Quick Start

Create `src/screenshotter.config.ts`:

```ts
import { defineScreenshotterConfig, mountScreenshotter } from "screenshotter";

const config = defineScreenshotterConfig({
  enabled: true,
  project: "my-app",
  captureSettleMs: 300,
});

mountScreenshotter(config);
```

Import it once in your app entrypoint:

```ts
import "./screenshotter.config";
```

That is enough to start capturing and downloading screenshots.

## Usage Patterns

### Pattern 1: Bootstrap Once (recommended)

Use `mountScreenshotter(config)` in one bootstrap file and import it once.

### Pattern 2: Manual React Mount

```tsx
import { ScreenshotterWidget } from "screenshotter";

export function DevTools() {
  return <ScreenshotterWidget enabled project="my-app" />;
}
```

Use this when you prefer explicit placement inside existing React trees.

## Framework Guides

### React + Vite

1. Add `src/screenshotter.config.ts` (Quick Start example).
2. Import `./screenshotter.config` in `src/main.tsx`.

### Next.js (App Router)

Create a client bootstrap component:

```tsx
"use client";

import { useEffect } from "react";
import { defineScreenshotterConfig, mountScreenshotter } from "screenshotter";

export function ScreenshotterBootstrap() {
  useEffect(() => {
    const unmount = mountScreenshotter(
      defineScreenshotterConfig({
        enabled: process.env.NODE_ENV === "development",
        project: "my-app",
      }),
    );
    return unmount;
  }, []);

  return null;
}
```

Render `<ScreenshotterBootstrap />` once in a client boundary.

### Remix

Create `app/screenshotter.client.ts`:

```ts
import { defineScreenshotterConfig, mountScreenshotter } from "screenshotter";

mountScreenshotter(
  defineScreenshotterConfig({
    enabled: true,
    project: "my-app",
  }),
);
```

Import it once in `app/entry.client.tsx`.

## API

### Named Exports

- `ScreenshotterWidget`
- `mountScreenshotter(options)`
- `defineScreenshotterConfig(config)`
- `type ScreenshotterWidgetProps`
- `type MountScreenshotterOptions`
- Protocol re-exports: `CaptureMode`, `CaptureFormat`, `CapturePayload`, `SaveResult`, `ThemeSelection`, `ThemeValue`

### `defineScreenshotterConfig(config)`

Identity helper for typed config authoring.

```ts
const config = defineScreenshotterConfig({
  enabled: true,
  project: "app",
});
```

### `mountScreenshotter(options)`

Programmatically mounts the widget to `document.body`.

```ts
const unmount = mountScreenshotter({ enabled: true });
```

Returns a cleanup function:

```ts
unmount();
```

## Configuration Reference

`mountScreenshotter(options)` accepts `MountScreenshotterOptions`, which extends `ScreenshotterWidgetProps` and adds `mountId`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `NODE_ENV === "development"` | Enables/disables widget rendering. |
| `project` | `string` | `"app"` | Included in capture payload metadata. |
| `elementPaddingPx` | `number` | `8` | Extra padding around element captures. |
| `captureSettleMs` | `number` | `700` | Wait time before each capture to let UI settle. |
| `defaultMode` | `"element" \| "viewport" \| "fullpage"` | `"element"` | Initial capture mode. |
| `themeSelectionDefault` | `"current" \| "both"` | `"current"` | Initial theme capture behavior. |
| `themeAdapter` | `{ getCurrentTheme; setTheme }` | `undefined` | Required for `"both"` theme capture. |
| `onSaved` | `(result) => void` | `undefined` | Called after each successful capture download. |
| `onError` | `(message) => void` | `undefined` | Called when capture fails. |
| `mountId` | `string` | `"screenshotter-root"` | DOM id used by `mountScreenshotter`. |

## Callbacks and Result Shape

### `onSaved(result)`

`result` follows this structure:

```ts
interface SaveResult {
  ok: true;
  relativePath: string;
  absolutePath: string;
  bytes: number;
}
```

In download-only mode, `relativePath` is the generated capture path pattern and `absolutePath` is the downloaded file name.

### `onError(message)`

Returns a user-facing error message string.

## Behavior Notes

- No backend transport is used in current package behavior.
- Captures are created from DOM/canvas and downloaded in the browser.
- For dual-theme capture (`themeSelectionDefault: "both"`), provide a `themeAdapter` that can read and set your app theme.

## Troubleshooting

- Widget not visible: set `enabled: true` explicitly and verify bootstrap import runs on the client.
- Dual-theme option unavailable: provide `themeAdapter` with both `getCurrentTheme` and `setTheme`.
- Download does not start: allow downloads/popups in browser settings.
- Next.js hydration/client errors: mount from a client component (`"use client"`).

## Development

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run release:check
```

## License

ISC
