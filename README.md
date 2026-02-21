# Screenshotter

Screenshotter now supports two workflows:

- In-app React widget (React-scan style launcher + panel + click-to-capture)
- Existing Playwright CLI automation (unchanged and still supported)

## Features

- Floating in-app launcher with slide-up capture panel
- Capture modes: `element` (default), `viewport`, `fullpage`
- Output controls: `PNG/JPEG`, quality slider (`1..100`), scale mapping (`1x..2x`)
- Optional dual-theme capture (`current` or `both` with a theme adapter)
- Local save server writes directly into project `screenshots/live-YYYYMMDD/...`
- Existing CLI supports light/dark + route + viewport + selector automation

## Requirements

- Node.js 18+
- pnpm
- React/Next app for widget integration

## Install

```bash
pnpm install
```

## In-App Widget (React/Next)

### 1) Start local save server

```bash
cp capture.widget.config.example.json capture.widget.config.json
pnpm run widget:server
```

Server defaults:

- Host: `127.0.0.1`
- Port: `4783`
- Output root: `./screenshots`
- Endpoint: `http://127.0.0.1:4783/api/captures`

### 2) Add widget to your app

```tsx
"use client";

import { ScreenshotterWidget } from "@screenshotter/widget";

export function DevScreenshotWidget() {
  return (
    <ScreenshotterWidget
      endpoint="http://127.0.0.1:4783/api/captures"
      project="matter-health"
      themeAdapter={{
        getCurrentTheme: () =>
          document.documentElement.classList.contains("dark") ? "dark" : "light",
        setTheme: (theme) => {
          document.documentElement.classList.toggle("dark", theme === "dark");
        },
      }}
    />
  );
}
```

`enabled` defaults to `NODE_ENV === "development"`.

### Widget behavior

- Floating launcher is always visible in dev (`Shot` button, bottom-right)
- Keyboard shortcut: `Cmd/Ctrl + Shift + K`
- `element` mode: click `Pick element`, hover highlight appears, click target and capture saves immediately
- `element` mode includes in-panel `Element padding` control (default `8px`)
- `viewport` / `fullpage`: click `Capture now` from panel
- Theme `both` requires `themeAdapter`; otherwise only `current` is available

### Widget API

```ts
export interface ScreenshotterWidgetProps {
  endpoint?: string; // default http://127.0.0.1:4783/api/captures
  token?: string;
  enabled?: boolean; // default NODE_ENV === "development"
  project?: string; // default "app"
  elementPaddingPx?: number; // default 8 (element mode crop padding)
  defaultMode?: "element" | "viewport" | "fullpage"; // default "element"
  themeSelectionDefault?: "current" | "both"; // default "current"
  themeAdapter?: {
    getCurrentTheme: () => "light" | "dark";
    setTheme: (theme: "light" | "dark") => void | Promise<void>;
  };
  onSaved?: (result: SaveResult) => void;
  onError?: (message: string) => void;
}
```

### Known widget limitations

- Uses `html2canvas-pro`; some cross-origin, video, and complex canvas content may render imperfectly
- Full-page capture depends on DOM renderability and may differ from Playwright pixel output
- Widget captures current browser auth/session state and does not manage Playwright storage state files

## Local Save Server

- Health endpoint: `GET /api/health`
- Capture endpoint: `POST /api/captures`
- Optional auth header: `x-screenshotter-token`
- Optional origin allowlist via `allowOrigins` in config

Capture file structure:

- Folder: `screenshots/live-YYYYMMDD/<routeSlug>/`
- Filename: `<routeSlug>-<mode>-<selectorOrSurface>-<theme>-<YYYYMMDD-HHmmss>.<ext>`

Example config:

```json
{
  "host": "127.0.0.1",
  "port": 4783,
  "outputRoot": "./screenshots",
  "token": "",
  "maxPayloadMB": 30,
  "allowOrigins": ["http://127.0.0.1:3000", "http://localhost:3000"]
}
```

## Playwright CLI (Unchanged)

The existing CLI flow is still supported and unchanged.

## Better Auth Login Flow

Create a local Playwright storage state file by logging in manually once:

```bash
node login.mjs \
  --url http://127.0.0.1:3000/login \
  --afterPath /dashboard \
  --stateOut ./state.local.json
```

This opens a browser window, waits until URL matches `--afterPath`, then saves session state.

## Capture Screenshots

### Full page (light + dark automatically, CLI)

```bash
node capture.mjs \
  --baseUrl http://127.0.0.1:3000 \
  --routes /dashboard \
  --state ./state.local.json \
  --presets macbook-14
```

### Full page via config example (CLI)

```bash
cp capture.fullpage.config.example.json capture.fullpage.config.json
node capture.mjs --config ./capture.fullpage.config.json
```

### Element capture (centered with equal margins, CLI)

```bash
node capture.mjs \
  --baseUrl http://127.0.0.1:3000 \
  --routes /dashboard \
  --state ./state.local.json \
  --presets macbook-14 \
  --selector 'xpath=//button[normalize-space()="More Details"]/ancestor::div[4]' \
  --selectorAll \
  --padding 8 \
  --waitMs 2200
```

### Named targets via config (CLI, recommended for team use)

Create a project-local config (start from `capture.config.example.json`) with named selectors.

```bash
cp capture.config.example.json capture.config.json
node capture.mjs \
  --config ./capture.config.json \
  --targets kpi-cards,filter-bar,table-no-footer
```

This removes hardcoded selectors from shell commands and makes captures portable per app.

### What each example file is for

- `capture.fullpage.config.example.json`: full-page screenshots
- `capture.config.example.json`: separated element/target screenshots

## Key Flags

- `--baseUrl`: Base app URL
- `--config`: JSON file for reusable named targets
- `--target` / `--targets`: Run named target(s) from config
- `--routes`: Comma-separated routes (default: `/dashboard`)
- `--route`: Single route
- `--page`: Route alias without leading slash (e.g. `clients-overview`)
- `--state`: Playwright storage state file
- `--presets`: `iphone-15,macbook-14`
- `--selector`: CSS/Playwright/XPath selector for element capture
- `--selectorFile`: Read selector from text file (avoids shell escaping)
- `--selectorName`: Friendly output name for custom selector
- `--selectorAll`: Capture all selector matches
- `--selectorIndex`: Capture one specific match (default: `0`)
- `--padding`: Symmetric crop padding for selector mode (default: `8`)
- `--waitMs`: Wait before screenshot (default: `800`)
- `--headful`: Run browser headful
- `--fullPage`: Full-page mode (cannot be used with `--selector`)
- `--out`: Output root (default: `./screenshots`)
- `--zip`: Also create a zip archive

## Output

Each run creates a job folder under `screenshots/<job-id>/` with files named like:

- `macbook-14-dashboard-light.png`
- `macbook-14-dashboard-dark.png`
- `macbook-14-dashboard-dark-<selector>-1.png`

## Security Notes

- Do not commit `state*.json` files.
- Do not commit any local auth/session files.

## Scripts

```bash
pnpm run login
pnpm run capture
pnpm run widget:server
pnpm run build
pnpm run test
```
