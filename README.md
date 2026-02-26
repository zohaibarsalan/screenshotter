# Screenshotter

Screenshotter is a TypeScript monorepo for local screenshot workflows in React apps.

It ships three focused packages:

| Package | Purpose |
| --- | --- |
| `@screenshotter/widget` | In-app React capture widget (element, viewport, full page) |
| `@screenshotter/server` | Local Node server that receives capture payloads and writes images |
| `@screenshotter/protocol` | Shared payload types, validation helpers, and file naming utilities |

## Highlights

- Keyboard-driven widget (`Cmd/Ctrl + Shift + K`)
- Capture modes: `element`, `viewport`, `fullpage`
- Output controls: `png`/`jpeg`, quality, scale, viewport presets
- Optional dual-theme capture (`current` or `both`)
- Local-first server safety defaults (`127.0.0.1`, optional token, origin allowlist)

## Install

### App consumers

```bash
pnpm add @screenshotter/widget @screenshotter/server
```

### Monorepo contributors

```bash
pnpm install
pnpm run build
pnpm run test
```

## Quick Start

### 1. Start the local save server

```js
import { startScreenshotterServer } from "@screenshotter/server";

const running = await startScreenshotterServer({
  host: "127.0.0.1",
  port: 4783,
  outputRoot: "./screenshots",
  token: "",
  maxPayloadMB: 30,
  allowOrigins: ["http://127.0.0.1:3000", "http://localhost:3000"],
});

console.log(`[screenshotter] running at ${running.url}`);
```

### 2. Mount the widget in your React app

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

## Saved File Layout

Captures are written to:

- Directory: `live-YYYYMMDD/<route-slug>/`
- File: `<route>-<mode>-<surface>-<theme>-<YYYYMMDD-HHmmss>.<ext>`

Example:

```text
screenshots/live-20260226/dashboard/dashboard-viewport-viewport-light-20260226-091501.png
```

## API Snapshot

### `@screenshotter/widget`

Main export:

- `ScreenshotterWidget`

Common props:

- `endpoint?: string` default `http://127.0.0.1:4783/api/captures`
- `project?: string` default `"app"`
- `enabled?: boolean` default `NODE_ENV === "development"`
- `defaultMode?: "element" | "viewport" | "fullpage"`
- `themeSelectionDefault?: "current" | "both"`
- `themeAdapter?: { getCurrentTheme; setTheme }` required for `"both"` capture

### `@screenshotter/server`

Exports:

- `startScreenshotterServer(config)`
- `loadServerConfigFromFile(filePath)`
- `DEFAULT_SERVER_CONFIG`
- `type ScreenshotterServerConfig`

Endpoints:

- `GET /api/health`
- `POST /api/captures`

### `@screenshotter/protocol`

Exports:

- `validateCapturePayload(input)`
- `buildCaptureFileParts(payload)`
- `clampQualityToScale(quality)`
- shared types (`CapturePayload`, `SaveResult`, etc.)

## Development

```bash
pnpm run build
pnpm run test
pnpm run release:check
```

## Publishing

1. Bump versions in `packages/*/package.json`.
2. Authenticate with npm:

```bash
npm login
npm whoami
```

3. Verify publish payload:

```bash
pnpm -r --filter "@screenshotter/*" pack --pack-destination /tmp
```

4. Publish:

```bash
pnpm run release:publish
```

If you intentionally publish from a dirty working tree, append `--no-git-checks`.

## Security Notes

- Server host is restricted to loopback (`127.0.0.1`, `localhost`, `::1`).
- Use `token` for local environments that are not fully trusted.
- Use `allowOrigins` to constrain browser requests.

## License

ISC
