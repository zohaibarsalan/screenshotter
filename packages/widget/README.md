# screenshotter

In-app screenshot capture for React apps with a one-package, download-only workflow.

## Install

```bash
pnpm add screenshotter
```

## Quick Start

```ts
import { defineScreenshotterConfig, mountScreenshotter } from "screenshotter";

mountScreenshotter(
  defineScreenshotterConfig({
    enabled: true,
    project: "my-app",
  }),
);
```

Import that file once in your client entrypoint.

## What You Get

- floating capture widget
- element / viewport / fullpage modes
- `png` and `jpeg` output
- browser download output (no backend setup)

## Exports

- `ScreenshotterWidget`
- `mountScreenshotter(options)`
- `defineScreenshotterConfig(config)`
- `type ScreenshotterWidgetProps`
- `type MountScreenshotterOptions`

## Notes

- Current package behavior is download-only.
- For dual-theme capture, provide `themeAdapter`.

## Full Documentation

- [Repository README](https://github.com/zohaibarsalan/screenshotter#readme)
- [Issue Tracker](https://github.com/zohaibarsalan/screenshotter/issues)

## License

ISC
